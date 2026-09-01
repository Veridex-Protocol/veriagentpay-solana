import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  OnModuleInit,
  Inject,
  forwardRef,
  Optional,
} from '@nestjs/common';
import { EnvelopeKind, EnvelopeStatus, NotificationType, UserActivityAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATIONS_STORE, type NotificationStore } from '../common/service-contracts';
import { NOTIFICATION_SERVICE, type UserNotifier } from '../common/service-contracts';
import { ActivityService } from '../activity/activity.service';
import { createBotChainProvider } from '../common/rpc-provider.helper';
import { getAppBaseUrl } from '../config/app-url.config';

import { IdentityService } from '../identity/identity.service';
import { ClaimRetryService } from '../relayer/claim-retry.service';
import { BadgesService } from '../badges/badges.service';
import { RelayerService } from '../relayer/relayer.service';
import { USER_TOKENS_SERVICE, type TokenResolver } from '../common/service-contracts';
import { createRelayerSigner } from '../relayer/relayer-signer.factory';

export interface CreateEnvelopeDto {
  token: string;
  totalAmount: number;
  numRecipients: number;
  type: 'OPEN' | 'CUSTOM';
  isRandom?: boolean;
  customRecipientId?: string;
  message?: string;
}

@Injectable()
export class EnvelopesService implements OnModuleInit {
  private readonly logger = new Logger(EnvelopesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATIONS_STORE)
    private readonly notificationsService: NotificationStore,
    @Inject(NOTIFICATION_SERVICE)
    private readonly unifiedNotificationService: UserNotifier,
    @Inject(forwardRef(() => ActivityService))
    private readonly activityService: ActivityService,
    @Inject(forwardRef(() => IdentityService))
    private readonly identityService?: IdentityService,
    @Inject(forwardRef(() => ClaimRetryService))
    private readonly claimRetryService?: ClaimRetryService,
    @Inject(forwardRef(() => BadgesService))
    private readonly badgesService?: BadgesService,
    @Optional() @Inject(forwardRef(() => RelayerService))
    private readonly relayerService?: RelayerService,
    // Optional and last so the manual construction in PlatformService keeps
    // working. Without it, custom tokens fall back to the built-in registry
    // and an envelope in a user-added token cannot be created or claimed.
    @Optional() @Inject(USER_TOKENS_SERVICE)
    private readonly userTokensService?: TokenResolver,
  ) { }

  /**
   * Resolves a token reference against a specific user's list.
   *
   * @dev Falls back to the built-in registry when {UserTokensService} is
   *      absent, which happens only on the manually-constructed instance.
   *      Resolution is per-user because a custom token exists only on the list
   *      of whoever added it — the creator, for both creating and claiming.
   */
  private async resolveTokenFor(userId: string, reference: string) {
    if (this.userTokensService) {
      const { token } = await this.userTokensService.resolveForUser(userId, reference);
      if (token) return token;
    }
    const { resolveToken } = await import('../config/tokens.config');
    return resolveToken(reference);
  }

  onModuleInit() {
    if (this.claimRetryService) {
      this.claimRetryService.registerExecutors({ envelopesService: this });
    }
  }

  async create(creatorId: string, dto: CreateEnvelopeDto) {
    if (!dto.totalAmount || dto.totalAmount <= 0) {
      throw new BadRequestException('Total amount must be > 0');
    }
    if (dto.type === 'CUSTOM' && !dto.customRecipientId) {
      throw new BadRequestException('Custom recipient required for CUSTOM envelope');
    }

    const token = (dto.token || 'USDC').toUpperCase();
    const type = dto.type === 'CUSTOM' ? EnvelopeKind.CUSTOM : EnvelopeKind.OPEN;
    const isRandom = dto.isRandom !== undefined ? Boolean(dto.isRandom) : (type === EnvelopeKind.OPEN);
    const count = type === EnvelopeKind.CUSTOM ? 1 : Math.max(1, dto.numRecipients || 1);

    // CRITICAL: Lock funds before creating envelope
    const creator = await this.resolveUser(creatorId);

    if (!creator?.smartWallet) {
      throw new BadRequestException('Creator wallet not found. Please complete onboarding first.');
    }

    if (!creator.sessionKeys || creator.sessionKeys.length === 0) {
      const err = new BadRequestException('No active session key. Please create a session key first.');
      (err as any).code = 'SESSION_KEY_REQUIRED';
      (err as any).requirePasskey = true;
      throw err;
    }

    // Create red envelope on-chain via SocialPayments contract
    let fundLockTxHash: string;
    let onChainEnvelopeId: number;

    try {
      const { ethers } = await import('ethers');
      const { RelayerService } = await import('../relayer/relayer.service');

      // Per-user: a custom token exists only on the list of whoever added it.
      const tokenInfo = await this.resolveTokenFor(creator.id, token);
      if (!tokenInfo) {
        throw new BadRequestException(`Unsupported token: ${token}`);
      }

      const socialPaymentsAddress = process.env.ENVELOPE_ESCROW_ADDRESS || process.env.SOCIAL_PAYMENTS_ADDRESS;
      if (!socialPaymentsAddress) {
        throw new BadRequestException('SocialPayments contract not configured');
      }

      const amountWei = ethers.parseUnits(dto.totalAmount.toString(), tokenInfo.decimals || 6);

      this.logger.log(`📝 Creating envelope: ${dto.totalAmount} ${token} for ${count} claims`);

      // Step 1: Approve SocialPayments contract to transfer tokens from creator's Smart Account
      const relayerSvc = this.relayerService || new RelayerService(this.prisma as any, undefined);
      const decryptedKey = await relayerSvc.decryptSessionKey(creator.sessionKeys[0]);
      const sessionWallet = new ethers.Wallet(decryptedKey);
      const sessionKeyHash = ethers.keccak256(ethers.solidityPacked(['address'], [sessionWallet.address]));

      const provider = createBotChainProvider();
      let nonce = 0;
      try {
        const vaultAbi = ['function localSessionNonces(bytes32 sessionKeyHash) view returns (uint256)'];
        const vaultContract = new ethers.Contract(creator.smartWallet.address, vaultAbi, provider);
        const nonceVal = await vaultContract.localSessionNonces(sessionKeyHash);
        nonce = Number(nonceVal);
      } catch (err) {
        nonce = 0;
      }

      // Resolve custom recipient wallet if CUSTOM type
      let customRecipientAddress = ethers.ZeroAddress;
      let customAmountWei = 0n;

      if (type === EnvelopeKind.CUSTOM && dto.customRecipientId) {
        const recipient = await this.prisma.user.findFirst({
          where: {
            OR: [
              { username: dto.customRecipientId.replace('@', '') },
              { telegramId: dto.customRecipientId.replace('@', '') },
              { whatsappId: dto.customRecipientId },
            ],
          },
          include: { smartWallet: true },
        });

        if (recipient?.smartWallet?.address) {
          customRecipientAddress = recipient.smartWallet.address;
          customAmountWei = amountWei;
        } else {
          throw new Error(`Custom recipient ${dto.customRecipientId} not found or hasn't completed onboarding`);
        }
      }

      // Encode ACTION_EXECUTE (type 2) for ERC20 approve
      const erc20Interface = new ethers.Interface(['function approve(address spender, uint256 amount) public returns (bool)']);
      const approveCalldata = erc20Interface.encodeFunctionData('approve', [socialPaymentsAddress, amountWei]);

      const typeByte = Buffer.from([2]); // ACTION_EXECUTE = 2
      const tokenTargetBytes = ethers.zeroPadValue(tokenInfo.address, 32);
      const zeroValueBytes = ethers.ZeroHash;

      const rawApproveData = ethers.getBytes(approveCalldata);
      const approveDataLenBuffer = Buffer.alloc(4);
      approveDataLenBuffer.writeUInt32BE(rawApproveData.length, 0);

      const approvePayload = ethers.hexlify(ethers.concat([
        typeByte,
        tokenTargetBytes,
        zeroValueBytes,
        approveDataLenBuffer,
        rawApproveData
      ]));

      const approveResult = await relayerSvc.executeLocalSessionAction(
        creator.id,
        creator.smartWallet.address,
        decryptedKey,
        approvePayload,
        dto.totalAmount,
        nonce
      );

      if (!approveResult.success) {
        throw new BadRequestException(`Token approval failed: ${approveResult.message}`);
      }

      this.logger.log(`✅ Token approval locked on-chain: ${approveResult.txHash}`);

      // Step 2: Call SocialPayments.createRedEnvelopeExtended() via creator's Smart Account ACTION_EXECUTE
      const socialPaymentsInterface = new ethers.Interface([
        'function createRedEnvelopeExtended(address token, uint256 totalAmount, uint32 count, bool isRandom, bytes32 claimHash, uint256 deadline, uint8 envelopeType, address customRecipient, uint256 customAmount) public returns (uint256)',
        'event RedEnvelopeCreated(uint256 indexed id, address indexed creator, address indexed token, uint256 amount, uint32 claims, uint8 envelopeType, address customRecipient)'
      ]);

      const claimHash = ethers.ZeroHash;
      const deadline = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60); // 7 days
      const envelopeType = type === EnvelopeKind.CUSTOM ? 1 : 0; // 0 = OPEN, 1 = CUSTOM

      const createCalldata = socialPaymentsInterface.encodeFunctionData('createRedEnvelopeExtended', [
        tokenInfo.address,
        amountWei,
        count,
        isRandom,
        claimHash,
        deadline,
        envelopeType,
        customRecipientAddress,
        customAmountWei
      ]);

      const rawCreateData = ethers.getBytes(createCalldata);
      const createDataLenBuffer = Buffer.alloc(4);
      createDataLenBuffer.writeUInt32BE(rawCreateData.length, 0);

      const createPayload = ethers.hexlify(ethers.concat([
        typeByte,
        ethers.zeroPadValue(socialPaymentsAddress, 32),
        zeroValueBytes,
        createDataLenBuffer,
        rawCreateData
      ]));

      const createResult = await relayerSvc.executeLocalSessionAction(
        creator.id,
        creator.smartWallet.address,
        decryptedKey,
        createPayload,
        dto.totalAmount,
        nonce + 1
      );

      if (!createResult.success) {
        throw new BadRequestException(`Envelope creation failed: ${createResult.message}`);
      }

      fundLockTxHash = createResult.txHash!;

      // Extract onChainEnvelopeId from event logs
      const receipt = await provider.getTransactionReceipt(fundLockTxHash);
      if (receipt) {
        const createdEvent = receipt.logs
          .map((log: any) => {
            try {
              return socialPaymentsInterface.parseLog(log);
            } catch {
              return null;
            }
          })
          .find((event: any) => event?.name === 'RedEnvelopeCreated');

        if (createdEvent) {
          onChainEnvelopeId = Number(createdEvent.args[0]);
        } else {
          onChainEnvelopeId = Date.now();
        }
      } else {
        onChainEnvelopeId = Date.now();
      }

      this.logger.log(`✅ Envelope created on-chain: ID=${onChainEnvelopeId}, TX=${fundLockTxHash}`);
    } catch (err: any) {
      this.logger.error(`Failed to create envelope on-chain: ${err.message}`);

      const wrapped = new BadRequestException(
        `Failed to create envelope: ${err.message}. Please ensure you have sufficient balance and an active session key.`,
      );
      // Carry the original classification across the rethrow. Callers decide
      // between "offer a one-tap passkey approval" and "surface a real error"
      // on this code; flattening it here made every limit breach look like an
      // unfixable failure to the bots.
      if (err?.code) (wrapped as any).code = err.code;
      if (err?.requirePasskey) (wrapped as any).requirePasskey = err.requirePasskey;
      throw wrapped;
    }

    let envelope: any;
    let persisted = false;
    const resolvedCreatorId = creator!.id; // Use the resolved UUID, not raw wallet address
    try {
      envelope = await this.prisma.redEnvelope.create({
        data: {
          creatorId: resolvedCreatorId,
          token,
          totalAmount: dto.totalAmount,
          numRecipients: count,
          type,
          isRandom,
          customRecipientId: dto.customRecipientId || null,
          remainingBalance: dto.totalAmount,
          remainingClaims: count,
          message: dto.message || '🧧 Happy Red Envelope!',
          status: EnvelopeStatus.ACTIVE,
          onChainId: onChainEnvelopeId,
          txHash: fundLockTxHash,
        },
      });
      persisted = true;
    } catch (e: any) {
      this.logger.error(`Failed to persist envelope to DB: ${e.message}`);
      // In-memory fallback
      envelope = {
        id: `env-${Date.now()}`,
        creatorId: resolvedCreatorId,
        token,
        totalAmount: dto.totalAmount,
        numRecipients: count,
        type,
        isRandom,
        customRecipientId: dto.customRecipientId || null,
        status: 'ACTIVE',
        remainingBalance: dto.totalAmount,
        remainingClaims: count,
        message: dto.message || '🧧 Happy Red Envelope!',
        createdAt: new Date(),
      };
    }

    const baseUrl = getAppBaseUrl();
    const deepLink = `${baseUrl}/envelopes/${envelope.id}`;

    if (persisted) {
      try {
        await this.activityService.record({
          userIdentifier: resolvedCreatorId,
          action: UserActivityAction.ENVELOPE_CREATED,
          amount: dto.totalAmount,
          token,
          metadata: { envelopeId: envelope.id, type, recipients: count },
        });
      } catch (err: any) {
        this.logger.warn(`Failed to record envelope creation activity: ${err.message}`);
      }

      // Unified notification for envelope creator
      this.unifiedNotificationService.notifyUser({
        userId: resolvedCreatorId,
        type: 'envelope_created',
        title: '🧧 Red Envelope Created!',
        body: `Your ${dto.totalAmount} ${token} Red Envelope is ready! Share with ${count} ${type === EnvelopeKind.CUSTOM ? 'custom recipient' : 'recipients'}.`,
        amount: dto.totalAmount,
        token,
        link: deepLink,
        metadata: { envelopeId: envelope.id, type, recipients: count },
      }).catch(err => this.logger.warn(`Failed to send unified notification: ${err.message}`));
    }

    // Notification for CUSTOM envelopes recipient
    if (type === EnvelopeKind.CUSTOM && dto.customRecipientId) {
      this.unifiedNotificationService.notifyUser({
        userId: dto.customRecipientId,
        type: 'envelope_created',
        title: 'Red Envelope Received! 🧧',
        body: `You received a Red Envelope of ${dto.totalAmount} ${token}! Tap to claim.`,
        amount: dto.totalAmount,
        token,
        link: deepLink,
        metadata: { envelopeId: envelope.id, creatorId: resolvedCreatorId },
      }).catch(err => this.logger.warn(`Failed to send unified notification: ${err.message}`));
    }

    return {
      success: true,
      envelope,
      deepLink,
      shareMessages: this.buildShareMessages(envelope.id, dto.totalAmount, token, type),
    };
  }

  async cancelEnvelope(id: string, creatorId: string) {
    const envelope = await this.findOne(id);

    // Resolve the creator to compare by UUID
    const creator = await this.resolveUser(creatorId);
    if (!creator) {
      throw new ForbiddenException('Creator not found');
    }
    if (envelope.creatorId !== creator.id) {
      throw new ForbiddenException('Only the envelope creator can cancel this envelope');
    }
    if (envelope.status !== EnvelopeStatus.ACTIVE) {
      throw new BadRequestException('Envelope is not active');
    }

    const refundedAmount = envelope.remainingBalance;

    // CRITICAL: Call SocialPayments.cancelEnvelope(onChainId) via creator's Smart Wallet ACTION_EXECUTE
    let refundTxHash: string | undefined;
    if (refundedAmount > 0 && envelope.onChainId) {
      try {
        const { ethers } = await import('ethers');
        const { RelayerService } = await import('../relayer/relayer.service');

        if (!creator.smartWallet) {
          throw new Error('Creator wallet not found');
        }
        if (!creator.sessionKeys || creator.sessionKeys.length === 0) {
          throw new Error('No active session key for refund');
        }

        const escrowAddress = process.env.ENVELOPE_ESCROW_ADDRESS || process.env.SOCIAL_PAYMENTS_ADDRESS;
        if (!escrowAddress) {
          throw new Error('Envelope escrow contract not configured');
        }

        const relayerSvc = this.relayerService || new RelayerService(this.prisma as any, undefined);
        const decryptedKey = await relayerSvc.decryptSessionKey(creator.sessionKeys[0]);
        const sessionWallet = new ethers.Wallet(decryptedKey);
        const sessionKeyHash = ethers.keccak256(ethers.solidityPacked(['address'], [sessionWallet.address]));

        const provider = createBotChainProvider();
        let nonce = 0;
        try {
          const vaultAbi = ['function localSessionNonces(bytes32 sessionKeyHash) view returns (uint256)'];
          const vaultContract = new ethers.Contract(creator.smartWallet.address, vaultAbi, provider);
          const nonceVal = await vaultContract.localSessionNonces(sessionKeyHash);
          nonce = Number(nonceVal);
        } catch (err) {
          nonce = 0;
        }

        const socialPaymentsInterface = new ethers.Interface([
          'function requestCancelEnvelope(uint256 id) external',
          'function cancelEnvelope(uint256 id) external',
          'function cancelRequestedAt(uint256) view returns (uint256)',
        ]);
        const cancelProvider = createBotChainProvider();
        const spContract = new ethers.Contract(escrowAddress, socialPaymentsInterface, cancelProvider);

        const cancelRequestedAt = await spContract.cancelRequestedAt(envelope.onChainId);
        const now = Math.floor(Date.now() / 1000);

        if (Number(cancelRequestedAt) === 0) {
          const reqCalldata = socialPaymentsInterface.encodeFunctionData('requestCancelEnvelope', [envelope.onChainId]);
          const typeByte = Buffer.from([2]); // ACTION_EXECUTE = 2
          const zeroValueBytes = ethers.ZeroHash;
          const rawReqData = ethers.getBytes(reqCalldata);
          const reqDataLenBuffer = Buffer.alloc(4);
          reqDataLenBuffer.writeUInt32BE(rawReqData.length, 0);

          const reqPayload = ethers.hexlify(ethers.concat([
            typeByte,
            ethers.zeroPadValue(escrowAddress, 32),
            zeroValueBytes,
            reqDataLenBuffer,
            rawReqData,
          ]));

          const reqResult = await relayerSvc.executeLocalSessionAction(
            creator.id,
            creator.smartWallet.address,
            decryptedKey,
            reqPayload,
            0,
            nonce,
          );

          if (!reqResult.success) {
            throw new Error(`On-chain requestCancel failed: ${reqResult.message}`);
          }
          this.logger.log(`Envelope #${envelope.onChainId} cancel requested. TX: ${reqResult.txHash}. Refund available in 1 hour.`);
          throw new Error('CANCEL_REQUESTED: Cancellation initiated. The refund will be available in 1 hour — retry then.');
        }

        if (now < Number(cancelRequestedAt) + 3600) {
          const readyAt = new Date((Number(cancelRequestedAt) + 3600) * 1000);
          throw new Error(`CANCEL_PENDING: Notice period active. Refund available after ${readyAt.toISOString()}.`);
        }

        const cancelCalldata = socialPaymentsInterface.encodeFunctionData('cancelEnvelope', [envelope.onChainId]);
        const typeByte = Buffer.from([2]); // ACTION_EXECUTE = 2
        const zeroValueBytes = ethers.ZeroHash;
        const rawCancelData = ethers.getBytes(cancelCalldata);
        const cancelDataLenBuffer = Buffer.alloc(4);
        cancelDataLenBuffer.writeUInt32BE(rawCancelData.length, 0);

        const cancelPayload = ethers.hexlify(ethers.concat([
          typeByte,
          ethers.zeroPadValue(escrowAddress, 32),
          zeroValueBytes,
          cancelDataLenBuffer,
          rawCancelData,
        ]));

        const cancelResult = await relayerSvc.executeLocalSessionAction(
          creator.id,
          creator.smartWallet.address,
          decryptedKey,
          cancelPayload,
          refundedAmount,
          nonce + (Number(cancelRequestedAt) > 0 ? 1 : 0),
        );

        if (!cancelResult.success) {
          throw new Error(`On-chain cancel failed: ${cancelResult.message}`);
        }

        refundTxHash = cancelResult.txHash!;
        this.logger.log(`✅ Envelope #${envelope.onChainId} cancelled on-chain. Refund TX: ${refundTxHash} (${refundedAmount} ${envelope.token} → ${creator.smartWallet.address})`);
      } catch (err: any) {
        this.logger.error(`Failed to cancel envelope on-chain: ${err.message}`);
        throw new BadRequestException(`Refund failed: ${err.message}. Please contact support.`);
      }
    }

    let persisted = false;
    try {
      await this.prisma.redEnvelope.update({
        where: { id },
        data: {
          status: EnvelopeStatus.CANCELLED,
          remainingBalance: 0,
          remainingClaims: 0,
        },
      });
      persisted = true;
    } catch (e: any) {
      this.logger.error(`Failed to update envelope status in DB: ${e.message}`);
    }

    // Log refund activity
    if (refundTxHash && persisted) {
      await this.activityService.record({
        userIdentifier: creator.id,
        action: UserActivityAction.ENVELOPE_CLAIMED,
        amount: refundedAmount,
        token: envelope.token,
        txHash: refundTxHash,
        metadata: { envelopeId: id, type: 'refund' },
      }).catch(() => {});
    }

    return {
      success: true,
      status: 'CANCELLED',
      amountRefunded: refundedAmount,
      txHash: refundTxHash,
    };
  }

  async claimEnvelope(id: string, claimerAddress: string) {
    const envelope = await this.findOne(id);
    if (envelope.status !== EnvelopeStatus.ACTIVE) {
      throw new BadRequestException('Envelope is no longer active');
    }
    if (envelope.remainingClaims <= 0 || envelope.remainingBalance <= 0) {
      throw new BadRequestException('Envelope has no remaining claims');
    }

    if (envelope.type === EnvelopeKind.CUSTOM) {
      if (envelope.customRecipientId) {
        const targetClean = envelope.customRecipientId.replace(/^@/, '').toLowerCase().trim();
        const claimerClean = claimerAddress.replace(/^@/, '').toLowerCase().trim();

        let isMatch = false;

        if (targetClean === claimerClean) {
          isMatch = true;
        } else if (
          targetClean.startsWith('0x') &&
          claimerClean.startsWith('0x') &&
          targetClean === claimerClean
        ) {
          isMatch = true;
        } else if (
          envelope.customRecipientId.includes(claimerAddress) ||
          claimerAddress.includes(envelope.customRecipientId)
        ) {
          isMatch = true;
        } else if (this.identityService) {
          try {
            const resolvedAddress = await this.identityService.resolveContact('telegram', envelope.customRecipientId);
            if (resolvedAddress && resolvedAddress.toLowerCase() === claimerClean) {
              isMatch = true;
            }
          } catch (err) { }
        }

        if (!isMatch) {
          throw new ForbiddenException('Only the designated custom recipient can claim this envelope');
        }
      }
    }

    // Calculate claim amount (fixed for custom/last claim/equal split, random for open lucky draw)
    let claimAmount = envelope.remainingBalance;
    if (envelope.type === EnvelopeKind.OPEN && envelope.remainingClaims > 1) {
      if (envelope.isRandom !== false) {
        const avg = envelope.remainingBalance / envelope.remainingClaims;
        claimAmount = parseFloat((Math.random() * (avg * 1.5 - avg * 0.5) + avg * 0.5).toFixed(2));
        claimAmount = Math.min(claimAmount, envelope.remainingBalance);
      } else {
        // Equal fixed split
        claimAmount = parseFloat((envelope.totalAmount / envelope.numRecipients).toFixed(2));
        claimAmount = Math.min(claimAmount, envelope.remainingBalance);
      }
    }

    const newBalance = Math.max(0, envelope.remainingBalance - claimAmount);
    const newClaims = Math.max(0, envelope.remainingClaims - 1);
    const newStatus = newClaims === 0 ? EnvelopeStatus.COMPLETED : EnvelopeStatus.ACTIVE;

    // Settled from the claimer's own vault, never from the relayer.
    //
    // `claimRedEnvelope` pays `safeTransfer(msg.sender, …)` and records
    // `redEnvelopeClaimed[id][msg.sender]`. Relaying it directly made the
    // relayer the claimer on both counts: the escrow paid *us*, a second
    // transfer forwarded our own tokens on to the recipient, and the claim flag
    // was burned for the whole envelope — so every later recipient reverted
    // with "Already claimed" and was quietly paid out of relayer funds while
    // their share stayed locked in escrow. A CUSTOM envelope could never settle
    // at all, since its `msg.sender == customRecipient` check saw the relayer.
    let claimTxHash: string;
    try {
      const { ethers } = await import('ethers');
      const { RelayerService } = await import('../relayer/relayer.service');
      const socialPaymentsAddress = process.env.ENVELOPE_ESCROW_ADDRESS || process.env.SOCIAL_PAYMENTS_ADDRESS;
      if (!socialPaymentsAddress) {
        throw new Error('SocialPayments contract not configured');
      }

      if (envelope.onChainId === null || envelope.onChainId === undefined) {
        throw new BadRequestException('Envelope not yet on chain');
      }
      const onChainId: number = envelope.onChainId;

      // Resolved against the creator's list, not the claimer's: the envelope
      // was denominated in whatever token they chose, and the claimer may
      // never have heard of it.
      const tokenInfo = await this.resolveTokenFor(envelope.creatorId, envelope.token);
      if (!tokenInfo) {
        throw new Error(`Unsupported token: ${envelope.token}`);
      }

      const claimer = await this.resolveUser(claimerAddress);
      if (!claimer?.smartWallet?.address) {
        throw new BadRequestException('Claimer wallet not found. Please complete onboarding first.');
      }

      // Reassigned: deployment may repair a legacy address the current factory
      // cannot deploy, and only the returned address ends up with code.
      const relayerSvc = this.relayerService || new RelayerService(this.prisma as any, undefined);
      const claimerWalletAddress = await relayerSvc.ensureVaultDeployed(claimer.smartWallet.address);

      const claimerSession = claimer.sessionKeys?.[0];
      if (!claimerSession) {
        const err = new BadRequestException(
          'No active session key for the claimer. Authorize a session key and retry.',
        );
        (err as any).code = 'SESSION_KEY_REQUIRED';
        (err as any).requirePasskey = true;
        throw err;
      }

      const amountWei = ethers.parseUnits(claimAmount.toString(), tokenInfo.decimals || 6);

      this.logger.log(`📝 Claiming envelope: ID=${onChainId}, Amount=${claimAmount} ${envelope.token}`);

      const provider = createBotChainProvider();
      const relayerSigner = createRelayerSigner(provider);
      const chainId = process.env.BOTCHAIN_CHAIN_ID || 968;

      // Signed over the claimer's vault because that is what `msg.sender` will
      // be — the contract hashes the same tuple and compares.
      const messageHash = ethers.solidityPackedKeccak256(
        ['uint256', 'address', 'uint256', 'address', 'uint256'],
        [chainId, socialPaymentsAddress, onChainId, claimerWalletAddress, amountWei],
      );
      const backendSignature = await relayerSigner.signMessage(ethers.getBytes(messageHash));

      const claimCalldata = new ethers.Interface([
        'function claimRedEnvelope(uint256 id, uint256 claimAmount, bytes calldata backendSignature)',
      ]).encodeFunctionData('claimRedEnvelope', [onChainId, amountWei, backendSignature]);

      const rawClaimData = ethers.getBytes(claimCalldata);
      const claimLenBuffer = Buffer.alloc(4);
      claimLenBuffer.writeUInt32BE(rawClaimData.length, 0);
      const claimPayload = ethers.hexlify(ethers.concat([
        Buffer.from([2]), // ACTION_EXECUTE
        ethers.zeroPadValue(socialPaymentsAddress, 32),
        ethers.ZeroHash,
        claimLenBuffer,
        rawClaimData,
      ]));

      this.logger.log(`  🔐 Executing on-chain claim for envelope #${onChainId} from ${claimerWalletAddress}...`);

      const claimerKey = await relayerSvc.decryptSessionKey(claimerSession);
      const sessionKeyHash = ethers.keccak256(
        ethers.solidityPacked(['address'], [new ethers.Wallet(claimerKey).address]),
      );
      let claimNonce = 0;
      try {
        const vault = new ethers.Contract(
          claimerWalletAddress,
          ['function localSessionNonces(bytes32 sessionKeyHash) view returns (uint256)'],
          provider,
        );
        claimNonce = Number(await vault.localSessionNonces(sessionKeyHash));
      } catch {
        claimNonce = 0;
      }

      const result = await relayerSvc.executeLocalSessionAction(
        claimer.id,
        claimerWalletAddress,
        claimerKey,
        claimPayload,
        claimAmount,
        claimNonce,
        // Claiming credits the vault. Spend caps exist to limit what a stolen
        // key can take out, so applying them here would only stop the rightful
        // owner from receiving money already escrowed for them.
        { inbound: true },
      );

      // Deliberately no relayer-transfer fallback. The previous one turned a
      // reverted escrow claim into a payment out of the relayer's own token
      // balance, leaving the escrow funded and the database marked as paid.
      // A failed claim must stay failed and retryable.
      if (!result.success || !result.txHash) {
        throw new Error(result.message || 'On-chain claimRedEnvelope reverted');
      }
      claimTxHash = result.txHash;

      this.logger.log(`✅ Envelope claim settled on-chain: TX=${claimTxHash} (${claimAmount} ${envelope.token} to ${claimerWalletAddress})`);
    } catch (err: any) {
      this.logger.error(`Failed to claim envelope on-chain: ${err.message}`);
      if (err instanceof BadRequestException || err instanceof ForbiddenException) throw err;
      throw new Error(`Claim failed: ${err.message}`);
    }
    let persisted = false;
    try {
      await this.prisma.envelopeClaim.create({
        data: {
          envelopeId: id,
          claimerAddress,
          amount: claimAmount,
        },
      });
      await this.prisma.redEnvelope.update({
        where: { id },
        data: {
          remainingBalance: newBalance,
          remainingClaims: newClaims,
          status: newStatus,
        },
      });
      persisted = true;
    } catch (e: any) {
      this.logger.warn(`Envelope claim DB update error: ${e.message}. Queueing for retry.`);
      if (this.claimRetryService) {
        await this.claimRetryService.recordPendingClaim(
          claimerAddress,
          'ENVELOPE_CLAIM',
          { envelopeId: id, claimerAddress, txHash: claimTxHash },
          e.message
        );
      }
    }

    if (persisted) {
      try {
        await this.activityService.record({
          userIdentifier: claimerAddress,
          action: UserActivityAction.ENVELOPE_CLAIMED,
          amount: claimAmount,
          token: envelope.token,
          metadata: { envelopeId: id, creatorId: envelope.creatorId },
        });
      } catch (err: any) {
        this.logger.warn(`Failed to record claim activity: ${err.message}`);
      }

      // Both parties resolved once: ids for routing, handles for reading.
      const [claimer, creator] = await Promise.all([
        this.resolveParty(claimerAddress),
        this.resolveParty(envelope.creatorId),
      ]);

      // Unified notification for claimer
      if (claimer.userId) {
        this.unifiedNotificationService.notifyUser({
          userId: claimer.userId,
          type: 'envelope_claimed',
          title: '🧧 Red Envelope Claimed!',
          body: `You claimed ${claimAmount} ${envelope.token} from ${creator.display}'s Red Envelope!`,
          amount: claimAmount,
          token: envelope.token,
          from: creator.display,
          link: `${getAppBaseUrl()}/envelopes/${id}`,
          metadata: { envelopeId: id, creatorId: envelope.creatorId },
        }).catch(err => this.logger.warn(`Failed to send unified notification: ${err.message}`));

        // Check and award badges for claimer
        if (this.badgesService) {
          this.badgesService.checkAndAwardBadges(claimer.userId).catch(err =>
            this.logger.warn(`Failed to check badges after envelope claim: ${err.message}`)
          );
        }
      } else {
        this.logger.warn(
          `Envelope ${id} claimed by ${claimerAddress}, which matches no account; skipping claimer notification.`,
        );
      }

      // Unified notification for creator
      if (creator.userId) {
        this.unifiedNotificationService.notifyUser({
          userId: creator.userId,
          type: 'envelope_claimed',
          title: 'Envelope Claimed! 🧧',
          body: `${claimer.display} claimed ${claimAmount} ${envelope.token} from your Red Envelope!`,
          amount: claimAmount,
          token: envelope.token,
          to: claimer.display,
          link: `${getAppBaseUrl()}/envelopes/${id}`,
          metadata: { envelopeId: id, claimAmount },
        }).catch(err => this.logger.warn(`Failed to send unified notification: ${err.message}`));
      }
    }

    return {
      success: true,
      claimedAmount: claimAmount,
      token: envelope.token,
      remainingClaims: newClaims,
      payItForward: this.buildPayItForward(id, claimAmount, envelope.token),
    };
  }

  /**
   * Closes the viral loop: every claimer is invited to create their own
   * envelope, pre-filled with half of what they just received.
   */
  /**
   * Turns whatever identifier a caller happens to hold into the two things
   * every notification needs: the account id it belongs to, and a name a person
   * can read.
   *
   * Claims arrive carrying a wallet address while envelopes store a creator
   * uuid, and both were being handed straight to the notification layer. That
   * produced `userId: 0x0daF…` — a wallet address in a foreign key expecting a
   * user id, which failed the `NotificationLog` insert and made badge checks
   * report "user not found" — and `From: 057aaa74-e1aa-…`, an internal uuid
   * shown to a person as though it were a name.
   *
   * @param identifier A wallet address, user uuid, or handle.
   * @returns `userId` is null when nothing matched, so callers can skip rather
   *          than write a row that violates the foreign key.
   */
  private async resolveParty(
    identifier: string | null | undefined,
  ): Promise<{ userId: string | null; display: string }> {
    const fallback = (value: string) =>
      value.startsWith('0x') && value.length === 42
        ? `${value.slice(0, 6)}…${value.slice(-4)}`
        : value;

    if (!identifier) return { userId: null, display: 'Someone' };

    try {
      const user = await this.prisma.user.findFirst({
        where: {
          OR: [
            { id: identifier },
            { username: identifier.replace(/^@/, '') },
            { smartWallet: { address: { equals: identifier, mode: 'insensitive' } } },
          ],
        },
        select: { id: true, username: true },
      });

      if (!user) return { userId: null, display: fallback(identifier) };

      return {
        userId: user.id,
        display: user.username ? `@${user.username.replace(/^@/, '')}` : fallback(identifier),
      };
    } catch {
      return { userId: null, display: fallback(identifier) };
    }
  }

  private buildPayItForward(sourceEnvelopeId: string, claimAmount: number, token: string) {
    const suggestedAmount = Math.max(1, Math.round(claimAmount * 0.5));
    const params = new URLSearchParams({
      amount: String(suggestedAmount),
      token,
      src: 'pay_it_forward',
      campaign: 'envelope_loop',
      from: sourceEnvelopeId,
    });

    return {
      prompt: 'Send one back? Create your own Red Envelope!',
      suggestedAmount,
      token,
      sourceEnvelopeId,
      deepLink: `${getAppBaseUrl()}/envelopes/create?${params.toString()}`,
      /** Ready-to-run bot command for chat surfaces. */
      botCommand: `/envelope ${suggestedAmount} 5`,
    };
  }

  async findOne(id: string) {
    const envelope = await this.prisma.redEnvelope.findUnique({
      where: { id },
      include: {
        claims: true,
        creator: {
          include: { smartWallet: true },
        },
      },
    });
    if (!envelope) throw new NotFoundException('Envelope not found');

    // Add creator wallet address to response for frontend authorization checks
    const result: any = this.withClaimSummary(envelope);
    if (envelope.creator?.smartWallet?.address) {
      result.creatorWalletAddress = envelope.creator.smartWallet.address;
    }
    delete result.creator; // Don't expose full creator object

    return result;
  }

  async findAllForUser(userId: string) {
    try {
      const user = await this.resolveUser(userId);
      const userIds = [userId, user?.id, user?.smartWallet?.address, user?.username, user?.telegramId].filter(Boolean) as string[];

      const envelopes = await this.prisma.redEnvelope.findMany({
        where: {
          OR: [
            { creatorId: { in: userIds } },
            { customRecipientId: { in: userIds } },
          ],
        },
        include: { claims: true },
        orderBy: { createdAt: 'desc' },
      });
      return envelopes.map((envelope) => this.withClaimSummary(envelope));
    } catch (e: any) {
      this.logger.error(`Failed to fetch envelopes for ${userId}: ${e.message}`);
      return [];
    }
  }

  /**
   * Claim progress is derived from persisted claim records, which is the
   * auditable source of truth.  The old client expected these summary fields
   * but the API returned only the raw relation, making a claimed envelope look
   * like 0 / N and leaving its remaining amount at the original total.
   */
  private withClaimSummary(envelope: any) {
    const claims = envelope.claims || [];
    const claimCount = claims.length;
    const totalClaimed = claims.reduce((sum: number, claim: { amount?: number }) => sum + Number(claim.amount || 0), 0);
    return {
      ...envelope,
      claimCount,
      totalClaimed,
      maxClaims: envelope.numRecipients,
      remainingBalance: Math.max(0, Number(envelope.totalAmount) - totalClaimed),
    };
  }

  private async resolveUser(identifier: string) {
    if (!identifier) return null;
    return this.prisma.user.findFirst({
      where: {
        OR: [
          { id: identifier },
          { email: { equals: identifier, mode: 'insensitive' } },
          { username: identifier },
          { telegramId: identifier },
          { whatsappId: identifier },
          { slackId: identifier },
          { discordId: identifier },
          { smartWallet: { address: { equals: identifier, mode: 'insensitive' } } },
        ],
      },
      include: {
        smartWallet: true,
        sessionKeys: {
          where: {
            expiryAt: { gte: new Date() },
            revokedAt: null,
            activatedAt: { not: null },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  /**
   * What a share link's recipient may see before they have an account.
   *
   * A recipient cannot sign in to decide whether to accept a gift, so this is
   * readable without a session — but it is a deliberately narrow projection,
   * not `findOne`. The claim list, the creator's wallet address, the on-chain
   * id, and the custom-recipient target stay behind auth; what leaves here is
   * only what the sender already intended the recipient to read.
   */
  async getPublicPreview(id: string) {
    const envelope = await this.prisma.redEnvelope.findUnique({
      where: { id },
      include: { claims: { select: { amount: true } }, creator: { select: { username: true } } },
    });
    if (!envelope) throw new NotFoundException('Envelope not found');

    const claimCount = envelope.claims.length;
    const totalClaimed = envelope.claims.reduce((sum, claim) => sum + Number(claim.amount || 0), 0);

    return {
      id: envelope.id,
      token: envelope.token,
      totalAmount: envelope.totalAmount,
      message: envelope.message,
      type: envelope.type,
      isRandom: envelope.isRandom,
      status: envelope.status,
      creatorUsername: envelope.creator?.username ?? null,
      claimCount,
      maxClaims: envelope.numRecipients,
      remainingClaims: envelope.remainingClaims,
      remainingBalance: Math.max(0, Number(envelope.totalAmount) - totalClaimed),
      // A CUSTOM envelope is addressed to one person; the claim endpoint is
      // what enforces that. Flagged here only so the page can say so upfront.
      isTargeted: envelope.type === EnvelopeKind.CUSTOM && Boolean(envelope.customRecipientId),
    };
  }

  async getClaims(id: string) {
    try {
      return await this.prisma.envelopeClaim.findMany({
        where: { envelopeId: id },
        orderBy: { createdAt: 'desc' },
      });
    } catch (e: any) {
      this.logger.error(`Failed to fetch claims for envelope ${id}: ${e.message}`);
      return [];
    }
  }

  getSharePayload(id: string) {
    const url = `${getAppBaseUrl()}/envelopes/${id}`;
    return {
      deepLink: url,
      messages: {
        telegram: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent('🧧 Claim your gasless Red Envelope on VeriAgent Pay!')}`,
        whatsapp: `https://wa.me/?text=${encodeURIComponent(`🧧 Claim your gasless Red Envelope on VeriAgent Pay! ${url}`)}`,
        discord: `🧧 Claim your gasless Red Envelope on VeriAgent Pay: ${url}`,
        rawText: `🧧 Claim your gasless Red Envelope on VeriAgent Pay! ${url}`,
      },
    };
  }

  private buildShareMessages(id: string, amount: number, token: string, type: string) {
    const url = `${getAppBaseUrl()}/envelopes/${id}`;
    const text = type === 'CUSTOM'
      ? `🧧 You've received a Red Envelope of ${amount} ${token} on VeriAgent Pay!`
      : `🧧 Claim from a ${amount} ${token} Red Envelope pool on VeriAgent Pay!`;

    return {
      deepLink: url,
      telegram: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
      whatsapp: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
      discord: `${text} ${url}`,
      rawText: `${text} ${url}`,
    };
  }
}
