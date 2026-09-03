import { Controller, Get, Post, Body, Headers, Req, UseGuards, BadRequestException, NotFoundException, UnauthorizedException, Logger, Inject, forwardRef } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { JWT_SECRET } from '../config/secrets';
import { TransferDto } from './dto/transfer.dto';
import { PasskeyExecutionService } from './passkey-execution.service';
import { RelayerMonitorService } from './relayer-monitor.service';
import { RelayerService } from './relayer.service';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CallPolicyService } from '../call-policy/call-policy.service';
import * as jwt from 'jsonwebtoken';
import { resolveToken } from '../config/tokens.config';
import { ActivityService } from '../activity/activity.service';
import { ContactsService } from '../contacts/contacts.service';
import { NOTIFICATION_SERVICE, type UserNotifier } from '../common/service-contracts';
import { BadgesService } from '../badges/badges.service';
import { IdentityService } from '../identity/identity.service';
import { WebAuthnService } from '../identity/webauthn.service';
import { ReputationService } from '../reputation/reputation.service';
import { isSolanaAddress } from '../chains/solana/solana-account';
import { SolanaRelayerService } from './solana-relayer.service';

@Controller('api/status')
export class StatusController {
  constructor(private readonly relayerMonitorService: RelayerMonitorService) {}

  /**
   * Public health status for frontend maintenance banner.
   * Returns boolean health status without disclosing internal wallet details.
   */
  @Get('relayer')
  @Public()
  getRelayerStatus() {
    const status = this.relayerMonitorService.getRelayerStatus();
    return {
      healthy: status.healthy,
      isLow: status.isLow,
    };
  }
}

/**
 * Moves user funds.
 *
 * Guarded at the class level: the sender is taken from the verified access
 * token, never from a request header. `x-wallet-address` is public data — it is
 * on-chain, rendered in the UI, and resolvable from a social handle — so
 * treating it as identity let any caller drain any user's vault.
 *
 * @see docs/audit/11th-august-2026-1.md — SEC-003
 */
@Controller('api/relay')
@UseGuards(JwtAuthGuard)
export class RelayTransferController {
  private readonly logger = new Logger(RelayTransferController.name);
  private readonly explorerUrl = process.env.SOLANA_EXPLORER_URL || 'https://explorer.solana.com';

  constructor(
    private readonly prisma: PrismaService,
    private readonly relayerService: RelayerService,
    private readonly activityService: ActivityService,
    private readonly contactsService: ContactsService,
    @Inject(NOTIFICATION_SERVICE)
    private readonly unifiedNotificationService: UserNotifier,
    private readonly webAuthnService: WebAuthnService,
    private readonly reputationService: ReputationService,
    private readonly passkeyExecution: PasskeyExecutionService,
    private readonly callPolicy: CallPolicyService,
    private readonly identityService?: IdentityService,
    @Inject(forwardRef(() => BadgesService))
    private readonly badgesService?: BadgesService,
  ) {}

  @Post('transfer')
  async transfer(
    @Req() req: any,
    @Headers('x-passkey-verified') passkeyVerified: string,
    @Headers('authorization') authorization: string,
    @Body() body: TransferDto,
  ) {
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedException('Authentication required');
    if (!body.to) throw new BadRequestException('Recipient (to) is required');
    if (!body.amount || body.amount <= 0) throw new BadRequestException('Amount must be greater than 0');

    // Check if passkey was just verified (fresh JWT issued within 60s)
    const skipBiometricCheck = this.isPasskeyFreshlyVerified(passkeyVerified, authorization);

    const token = resolveToken(body.token);
    if (!token) throw new BadRequestException(`Unsupported token: ${body.token}`);
    if (token.symbol === 'SOL') {
      const error = new BadRequestException('Native SOL transfers require passkey authorization');
      (error as any).code = 'BIOMETRICS_REQUIRED';
      throw error;
    }

    // Sender resolved from the token subject, not from a caller-supplied address.
    const senderUser = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        smartWallet: true,
        sessionKeys: {
          where: { expiryAt: { gte: new Date() }, revokedAt: null, activatedAt: { not: null } },
          orderBy: { createdAt: 'desc' as const },
          take: 1,
        },
      },
    });

    if (!senderUser || !senderUser.smartWallet) {
      throw new NotFoundException('Sender wallet not found. Please register your passkey wallet first.');
    }

    const walletAddress = senderUser.smartWallet.address;

    if (!senderUser.sessionKeys || senderUser.sessionKeys.length === 0) {
      const error = new BadRequestException('No active session key. Please create a session key to enable instant transfers.');
      (error as any).code = 'SESSION_KEY_REQUIRED';
      throw error;
    }

    const recipientAddress = await this.resolveRecipientAddress(body.to);
    if (!recipientAddress) {
      throw new NotFoundException(`Recipient "${body.to}" not found or has no registered wallet.`);
    }

    const activeSession = senderUser.sessionKeys[0];
    const decryptedKey = await this.relayerService.decryptSessionKey(activeSession);
    const vaultAddress = senderUser.smartWallet.address;

    this.logger.log(
      `[WebTransfer] Executing: ${body.amount} ${token.symbol} from ${vaultAddress} to ${recipientAddress}`
    );

    let result: any;
    try {
      result = await (this.relayerService as unknown as SolanaRelayerService).executeSessionTransfer({
        userId: senderUser.id,
        vaultAddress,
        recipientAddress,
        encryptedSessionKey: decryptedKey,
        txAmountUSD: body.amount,
        skipBiometricCheck,
      });
      this.logger.log(`[WebTransfer] Solana session transfer returned: success=${result?.success}, txHash=${result?.txHash}`);
    } catch (err: any) {
      this.logger.error(`[WebTransfer] executeLocalSessionAction threw error: ${err.message}`, err.stack);
      throw err;
    }

    if (!result || !result.success || !result.txHash) {
      this.logger.error(`[WebTransfer] Transfer failed: result=${JSON.stringify(result)}`);
      throw new BadRequestException('Transfer execution failed');
    }

    if (result.success && result.txHash) {
      await this.activityService.record({
        userIdentifier: senderUser.id,
        action: 'TRANSFER_SENT',
        amount: body.amount,
        token: token.symbol,
        txHash: result.txHash,
        metadata: { recipient: body.to, to: recipientAddress, platform: 'web', source: 'web' },
      });

      this.contactsService.upsertAfterPayment(
        senderUser.id,
        'web',
        body.to.replace(/^@/, ''),
        recipientAddress,
      ).catch(() => {});

      // Send unified notifications
      // Notify sender
      this.unifiedNotificationService.notifyUser({
        userId: senderUser.id,
        type: 'money_sent',
        title: 'Payment Sent ✅',
        body: `You sent ${body.amount} ${token.symbol} to ${body.to}`,
        amount: body.amount,
        token: token.symbol,
        to: body.to,
        link: this.transactionExplorerUrl(result.txHash),
        metadata: { txHash: result.txHash, note: body.note },
      }).catch(err => this.logger.warn(`Failed to send unified notification: ${err.message}`));

      // Notify recipient
      const recipientUser = await this.prisma.user.findFirst({
        where: {
          smartWallet: {
            address: { equals: recipientAddress },
          },
        },
      });

      if (recipientUser) {
        this.unifiedNotificationService.notifyUser({
          userId: recipientUser.id,
          type: 'money_received',
          title: '💰 Money Received!',
          body: `You received ${body.amount} ${token.symbol} from ${senderUser.username ? `@${senderUser.username}` : walletAddress}${body.note ? ` - ${body.note}` : ''}`,
          amount: body.amount,
          token: token.symbol,
          from: senderUser.username ? `@${senderUser.username}` : walletAddress,
          link: this.transactionExplorerUrl(result.txHash),
          metadata: { txHash: result.txHash, from: senderUser.username || walletAddress },
        }).catch(err => this.logger.warn(`Failed to send recipient notification: ${err.message}`));
      }

      // Award reputation points for transfer
      this.reputationService.awardTransferPoints(senderUser.id, body.amount, result.txHash).catch(err =>
        this.logger.warn(`Failed to award reputation points: ${err.message}`)
      );

      // Check and award badges for sender (transaction count)
      if (this.badgesService) {
        this.badgesService.checkAndAwardBadges(senderUser.id).catch(err =>
          this.logger.warn(`Failed to check badges for sender: ${err.message}`)
        );
      }
    }

    return {
      txHash: result.txHash,
      success: result.success,
      method: 'session_key', // Indicates session key was used
      sessionKeyId: activeSession.id,
    };
  }

  private transactionExplorerUrl(signature: string): string {
    const cluster = process.env.SOLANA_CLUSTER || 'devnet';
    return `${this.explorerUrl}/tx/${signature}?cluster=${encodeURIComponent(cluster)}`;
  }

  /**
   * Stage a transfer and return the challenge the user's passkey must sign.
   *
   * Step one of the on-chain-verified path. The challenge commits to the exact
   * action — vault, chain, payload, nonce — so the resulting assertion cannot
   * authorize anything else. The payload stays server-side; the client gets an
   * opaque `prepareId`.
   *
   * @see docs/audit/11th-august-2026-1.md — SEC-001
   */
  @Post('passkey/prepare')
  async preparePasskeyTransfer(@Req() req: any, @Body() body: TransferDto) {
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedException('Authentication required');

    const token = resolveToken(body.token);
    if (!token) throw new BadRequestException(`Unsupported token: ${body.token}`);

    const recipientAddress = await this.resolveRecipientAddress(body.to);
    if (!recipientAddress && token.symbol !== 'SOL') {
      throw new NotFoundException(`Recipient "${body.to}" not found or has no registered wallet.`);
    }

    if (!recipientAddress) {
      return (this.passkeyExecution as any).prepareSolPaymentLink({
        userId,
        recipientHandle: body.to,
        platform: 'telegram',
        amount: body.amount,
      });
    }

    return this.passkeyExecution.prepareTransfer({
      userId,
      recipientAddress,
      tokenAddress: token.address,
      tokenDecimals: token.decimals,
      tokenSymbol: token.symbol,
      amount: body.amount,
      toLabel: body.to,
    });
  }

  /**
   * Submit a prepared transfer with the user's assertion.
   *
   * The relayer pays gas and carries no authority: the contract verifies the
   * passkey itself, so a compromised backend cannot move funds through here.
   */
  @Post('passkey/execute')
  async executePasskeyTransfer(
    @Req() req: any,
    @Body() body: { prepareId: string; assertion: any },
  ) {
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedException('Authentication required');
    if (!body?.prepareId || !body?.assertion) {
      throw new BadRequestException('prepareId and assertion are required');
    }

    const result = await this.passkeyExecution.executeAction({
      userId,
      prepareId: body.prepareId,
      assertion: body.assertion,
    });

    if (result.kind !== 'sol_payment_link_cancel') {
      const amount = typeof result.summary?.amount === 'number' ? result.summary.amount : undefined;
      const token = typeof result.summary?.token === 'string' ? result.summary.token : undefined;
      const destination = typeof result.summary?.to === 'string' ? result.summary.to : undefined;
      this.activityService
        .record({
          userIdentifier: userId,
          action: result.kind === 'sol_payment_link' ? 'ENVELOPE_CREATED' : 'TRANSFER_SENT',
          amount,
          token,
          txHash: result.txHash,
          metadata: {
            method: 'executeWithPasskey',
            kind: result.kind,
            code: result.code,
            to: destination,
          },
        })
        .catch(() => {});
    }

    return { ...result, method: 'passkey_onchain' };
  }

  @Post('passkey/prepare-link-cancel')
  async preparePasskeyLinkCancel(
    @Req() req: any,
    @Body() body: { code: string },
  ) {
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedException('Authentication required');
    if (!body?.code) throw new BadRequestException('Payment-link code is required');
    return (this.passkeyExecution as any).prepareCancelSolPaymentLink({
      userId,
      code: body.code,
    });
  }

  /**
   * Stage a session-key grant for passkey authorization.
   *
   * Grants used to be registered by the relayer. That path is blocked on-chain
   * now — a delegated authority must not be able to mint itself more — so the
   * user authorizes their own session key exactly as they would a payment.
   */
  @Post('passkey/prepare-session')
  async preparePasskeySession(
    @Req() req: any,
    @Body() body: { durationHours?: number; durationDays?: number; perTxLimitUSD?: number; dailyLimitUSD?: number },
  ) {
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedException('Authentication required');

    return this.passkeyExecution.prepareSessionGrant({
      userId,
      durationHours: body?.durationHours,
      durationDays: body?.durationDays,
      perTxLimitUSD: body?.perTxLimitUSD,
      dailyLimitUSD: body?.dailyLimitUSD,
    });
  }

  /**
   * Stage a call-policy refresh for the caller's vault.
   *
   * @dev The entries are computed here, never accepted from the client. This
   *      endpoint's whole purpose is to widen what a session key may reach, so
   *      letting the caller name the targets would hand a compromised session
   *      the ability to request its own escalation — the passkey prompt would
   *      then be the only thing between an attacker and an arbitrary allowlist,
   *      and users approve prompts they are shown. Restricting it to the
   *      protocol's own current addresses keeps the prompt meaningful.
   */
  @Post('passkey/prepare-policy-refresh')
  async preparePolicyRefresh(@Req() req: any) {
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedException('Authentication required');

    // Read from the admin-managed list rather than a literal here, so adding a
    // contract is an operational change. It falls back to the built-in protocol
    // set while the table is untouched — an empty table means "not configured",
    // not "grant nothing", which would quietly break group pools for everyone.
    const entries = await this.callPolicy.activeEntries();
    if (entries.length === 0) {
      throw new BadRequestException(
        'No contract permissions are configured, so there is nothing to authorize.',
      );
    }

    return this.passkeyExecution.preparePolicyUpdate({ userId, entries });
  }

  /**
   * Stage a per-token spending cap for the caller's vault.
   *
   * @dev The token must already be in the supported registry or on the caller's
   *      own watch list; the service rejects anything else. A cap is restrictive
   *      rather than permissive — an unconfigured token is *not* blocked, it is
   *      merely bounded by a raw-amount global limit that means nothing across
   *      differing decimals — so this endpoint tightens a vault rather than
   *      widening it. It still requires the passkey, because `setTokenLimit` is
   *      `onlyVault` and no delegated path may reach the spending module.
   */
  @Post('passkey/prepare-token-limit')
  async prepareTokenLimit(
    @Req() req: any,
    @Body() body: { tokenAddress: string; dailyLimitUnits?: number },
  ) {
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedException('Authentication required');

    if (!body?.tokenAddress) {
      throw new BadRequestException('tokenAddress is required');
    }

    return this.passkeyExecution.prepareTokenLimit({
      userId,
      tokenAddress: body.tokenAddress,
      dailyLimitUnits: body.dailyLimitUnits,
    });
  }

  /**
   * Transfer authorized by a fresh WebAuthn assertion.
   *
   * `@Public()` because the assertion *is* the authentication — and a stronger
   * one than a bearer token: it is verified against a server-issued,
   * single-use challenge with origin, RP ID, and user-verification checks
   * before any funds move. Requiring a token in addition would break the
   * newly-onboarded recipient who has a passkey but no session yet.
   */
  @Public()
  @Post('transfer/passkey')
  async transferWithPasskey(
    @Body() body: {
      to: string;
      token: string;
      amount: number;
      note?: string;
      challengeId: string;
      assertion: any;
    },
  ) {
    if (!body.challengeId || !body.assertion) {
      throw new BadRequestException('WebAuthn challengeId and assertion are required');
    }
    if (!body.to) throw new BadRequestException('Recipient (to) is required');
    if (!body.amount || body.amount <= 0) throw new BadRequestException('Amount must be greater than 0');

    const token = resolveToken(body.token);
    if (!token) throw new BadRequestException(`Unsupported token: ${body.token}`);

    // Verify WebAuthn assertion (triggers biometric check on device)
    let authResult: any;
    try {
      authResult = await this.webAuthnService.verifyAuthentication(body.challengeId, body.assertion);
    } catch (err: any) {
      throw new UnauthorizedException(err.message || 'Passkey verification failed');
    }

    if (!authResult?.success || !authResult.walletAddress) {
      throw new UnauthorizedException('Passkey authentication failed');
    }

    const vaultAddress = authResult.walletAddress;
    const userId = authResult.userId;

    const recipientAddress = await this.resolveRecipientAddress(body.to);
    if (!recipientAddress) {
      throw new NotFoundException(`Recipient "${body.to}" not found or has no registered wallet.`);
    }

    this.logger.log(
      `[PasskeyTransfer] Executing: ${body.amount} ${token.symbol} from ${vaultAddress} to ${recipientAddress}`
    );

    const session = await this.prisma.sessionKey.findFirst({
      where: {
        userId,
        activatedAt: { not: null },
        revokedAt: null,
        expiryAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!session) {
      throw new BadRequestException(
        'No bounded Solana session is active. Use the prepared passkey transfer flow.',
      );
    }
    const decryptedKey = await this.relayerService.decryptSessionKey(session);
    const result = await (this.relayerService as unknown as SolanaRelayerService).executeSessionTransfer({
      userId,
      vaultAddress,
      recipientAddress,
      encryptedSessionKey: decryptedKey,
      txAmountUSD: body.amount,
      skipBiometricCheck: true,
    });

    if (result.success && result.txHash) {
      await this.activityService.record({
        userIdentifier: userId,
        action: 'TRANSFER_SENT',
        amount: body.amount,
        token: token.symbol,
        txHash: result.txHash,
        metadata: { recipient: body.to, to: recipientAddress, method: 'passkey', platform: 'web', source: 'web' },
      });

      this.contactsService.upsertAfterPayment(
        userId,
        'web',
        body.to.replace(/^@/, ''),
        recipientAddress,
      ).catch(() => {});

      this.unifiedNotificationService.notifyUser({
        userId,
        type: 'money_sent',
        title: 'Payment Sent ✅',
        body: `You sent ${body.amount} ${token.symbol} to ${body.to}`,
        amount: body.amount,
        token: token.symbol,
        to: body.to,
        link: this.transactionExplorerUrl(result.txHash),
        metadata: { txHash: result.txHash, note: body.note },
      }).catch(err => this.logger.warn(`Failed to send notification: ${err.message}`));

      const recipientUser = await this.prisma.user.findFirst({
        where: {
          smartWallet: {
            address: { equals: recipientAddress },
          },
        },
      });

      if (recipientUser) {
        const senderUser = await this.prisma.user.findUnique({ where: { id: userId } });
        this.unifiedNotificationService.notifyUser({
          userId: recipientUser.id,
          type: 'money_received',
          title: '💰 Money Received!',
          body: `You received ${body.amount} ${token.symbol} from ${senderUser?.username ? `@${senderUser.username}` : vaultAddress}${body.note ? ` - ${body.note}` : ''}`,
          amount: body.amount,
          token: token.symbol,
          from: senderUser?.username ? `@${senderUser.username}` : vaultAddress,
          link: this.transactionExplorerUrl(result.txHash),
          metadata: { txHash: result.txHash },
        }).catch(err => this.logger.warn(`Failed to send recipient notification: ${err.message}`));
      }

      if (this.badgesService) {
        this.badgesService.checkAndAwardBadges(userId).catch(() => {});
      }
    }

    return {
      txHash: result.txHash,
      success: result.success,
      method: 'passkey',
    };
  }

  /**
   * Whether this request is covered by a recent passkey verification.
   *
   * @dev Requires a `pkv` claim the server sets only on tokens minted by a
   *      WebAuthn ceremony, *and* that the token is fresh. Age alone is not
   *      enough: it proves the caller authenticated recently by some means, not
   *      that they proved possession of the passkey. A wallet-challenge token
   *      is equally fresh and must not skip the biometric step.
   *
   *      The `x-passkey-verified` header remains a hint only — it can never
   *      grant anything the signed token does not already assert.
   *
   * @see docs/security-remaining-issues.md — BE-M-14
   */
  private isPasskeyFreshlyVerified(passkeyHeader: string, authHeader: string): boolean {
    if (!authHeader) return false;
    const bearerToken = authHeader.replace(/^Bearer\s+/i, '');
    try {
      // 1. Verify cryptographic JWT signature and validate pkv claim first
      const decoded = jwt.verify(bearerToken, JWT_SECRET) as any;
      if (decoded.pkv !== true) return false;
      const issuedAt = decoded.iat;
      if (!issuedAt) return false;
      const ageSeconds = Math.floor(Date.now() / 1000) - issuedAt;
      if (ageSeconds >= 120) return false;

      // 2. Header is advisory only; if provided, it cannot be false
      if (passkeyHeader && passkeyHeader !== 'true') return false;
      return true;
    } catch {
      return false;
    }
  }

  private async resolveRecipientAddress(to: string): Promise<string | null> {
    if (!to || !to.trim()) return null;
    if (this.identityService) {
      try {
        return await this.identityService.resolveContact('web', to);
      } catch (err: any) {
        this.logger.warn(`IdentityService resolveContact failed for "${to}": ${err.message}`);
      }
    }

    if (isSolanaAddress(to)) {
      return to;
    }

    const cleanHandle = to.replace(/^@/, '').trim();

    const socialNode = await this.prisma.socialNode.findFirst({
      where: {
        OR: [
          { username: cleanHandle },
          { username: `@${cleanHandle}` },
          { platformUserId: cleanHandle },
        ],
      },
      include: { user: { include: { smartWallet: true } } },
    });

    if (socialNode?.user?.smartWallet?.address) {
      return socialNode.user.smartWallet.address;
    }

    const userByUsername = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: cleanHandle },
          { telegramId: cleanHandle },
          { whatsappId: cleanHandle },
          { discordId: cleanHandle },
        ],
      },
      include: { smartWallet: true },
    });

    if (userByUsername?.smartWallet?.address) {
      return userByUsername.smartWallet.address;
    }

    return null;
  }
}
