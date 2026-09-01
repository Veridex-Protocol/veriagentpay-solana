import { Injectable, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { UserActivityAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ethers } from 'ethers';
import { IdentityService } from '../identity/identity.service';
import { ShortLinksService } from '../shortlinks/shortlinks.service';
import { RelayerService } from '../relayer/relayer.service';
import { ActivityService } from '../activity/activity.service';
import * as crypto from 'crypto';
import { isProvisionalPlatformId } from '../config/provisional-identity';
import { getTelegramDeepLink } from '../config/app-url.config';
import { createRelayerSigner } from '../relayer/relayer-signer.factory';
import { createBotChainProvider } from '../common/rpc-provider.helper';
import { RedisService } from '../core/redis.service';

export interface CreateEscrowLinkDto {
  senderUserId: string;
  senderVaultAddress: string;
  platform: string;
  recipientHandle: string;
  amount: number;
  token?: string;
  fromUser?: string;
}

@Injectable()
export class EscrowService {
  private readonly logger = new Logger(EscrowService.name);
  private readonly provider = createBotChainProvider();

  private readonly socialPaymentsAddress = process.env.SOCIAL_PAYMENTS_ADDRESS || '';
  /** Widened from `Wallet`: a KMS-backed signer implements the same
   *  interface without exposing key material. */
  private readonly relayerSigner: ethers.Signer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly identityService: IdentityService,
    private readonly shortLinksService: ShortLinksService,
    private readonly relayerService: RelayerService,
    private readonly redis: RedisService,
    private readonly activityService?: ActivityService
  ) {
    this.relayerSigner = createRelayerSigner(this.provider);
  }

  /**
   * Pre-flight check & escrow creation for 1-on-1 social payment links.
   */
  async createClaimLink(dto: CreateEscrowLinkDto) {
    if (!this.socialPaymentsAddress) {
      throw new BadRequestException('SOCIAL_PAYMENTS_ADDRESS not configured');
    }

    const tokenSymbol = dto.token || 'USDC';
    const amountWei = ethers.parseUnits(dto.amount.toString(), 6);

    // 1. Resolve recipient address if user is already registered
    const existingRecipient = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: dto.recipientHandle.replace(/^@/, '') },
          { telegramId: dto.recipientHandle.replace(/^@/, '') },
          { whatsappId: dto.recipientHandle },
          { discordId: dto.recipientHandle },
          { slackId: dto.recipientHandle },
        ],
      },
      include: { smartWallet: true },
    });
    const recipientAddr = existingRecipient?.smartWallet?.address || null;

    // 2. Pre-flight check on sender vault & session key
    const senderUser = await this.prisma.user.findUnique({
      where: { id: dto.senderUserId },
      // `activatedAt` is what separates a provisioned key from a granted one.
      // Without it the escrow is built around a key the vault will reject.
      include: {
        smartWallet: true,
        sessionKeys: { where: { revokedAt: null, expiryAt: { gt: new Date() }, activatedAt: { not: null } } },
      },
    });

    if (!senderUser || !senderUser.smartWallet) {
      throw new BadRequestException('Sender wallet setup required prior to sending funds. Please set up your wallet first.');
    }

    if (!senderUser.sessionKeys || senderUser.sessionKeys.length === 0) {
      const err = new BadRequestException('No active session key provisioned. Please authorize a session key to send funds.');
      (err as any).code = 'SESSION_KEY_REQUIRED';
      (err as any).requirePasskey = true;
      throw err;
    }

    const activeSession = senderUser.sessionKeys[0];
    if (dto.amount > Number(activeSession.perTxLimitUSD)) {
      throw new ForbiddenException(`Transfer amount ($${dto.amount}) exceeds session per-tx limit ($${activeSession.perTxLimitUSD}).`);
    }

    // 3. Resolve token info
    const { resolveToken } = await import('../config/tokens.config');
    const tokenInfo = resolveToken(tokenSymbol);
    if (!tokenInfo) {
      throw new BadRequestException(`Unsupported token: ${tokenSymbol}`);
    }

    // 4. Decrypt session key and get nonce
    const decryptedKey = await this.relayerService.decryptSessionKey(activeSession);
    const sessionWallet = new ethers.Wallet(decryptedKey);
    const sessionKeyHash = ethers.keccak256(ethers.solidityPacked(['address'], [sessionWallet.address]));

    let nonce = 0;
    try {
      const vaultAbi = ['function localSessionNonces(bytes32 sessionKeyHash) view returns (uint256)'];
      const vaultContract = new ethers.Contract(senderUser.smartWallet!.address, vaultAbi, this.provider);
      const nonceVal = await vaultContract.localSessionNonces(sessionKeyHash);
      nonce = Number(nonceVal);
    } catch {
      nonce = 0;
    }

    // 5. Approve SocialPayments contract to pull tokens from sender vault
    const erc20Interface = new ethers.Interface(['function approve(address spender, uint256 amount) public returns (bool)']);
    const approveCalldata = erc20Interface.encodeFunctionData('approve', [this.socialPaymentsAddress, amountWei]);

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

    const approveResult = await this.relayerService.executeLocalSessionAction(
      dto.senderUserId,
      senderUser.smartWallet!.address,
      decryptedKey,
      approvePayload,
      dto.amount,
      nonce
    );

    if (!approveResult.success) {
      throw new BadRequestException(`Token approval failed: ${approveResult.message}`);
    }
    this.logger.log(`✅ Escrow token approval: ${approveResult.txHash}`);

    // 6. Create on-chain escrow via createRedEnvelopeExtended
    const socialPaymentsInterface = new ethers.Interface([
      'function createRedEnvelopeExtended(address token, uint256 totalAmount, uint32 count, bool isRandom, bytes32 claimHash, uint256 deadline, uint8 envelopeType, address customRecipient, uint256 customAmount) public returns (uint256)',
      'event RedEnvelopeCreated(uint256 indexed id, address indexed creator, address indexed token, uint256 amount, uint32 claims, uint8 envelopeType, address customRecipient)'
    ]);

    const claimHash = ethers.ZeroHash;
    const deadlineOnChain = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 days
    const customRecipient = recipientAddr || ethers.ZeroAddress;

    // EnvelopeType { OPEN = 0, CUSTOM = 1 }.
    //
    // CUSTOM pins the envelope to one address on-chain, which is only possible
    // for a recipient who already has a wallet. For an unregistered handle —
    // the case this whole claim-link flow exists for — there is no address yet,
    // and declaring CUSTOM with the zero address reverts on
    // `require(customRecipient != address(0))`. Those escrows are created OPEN
    // and gated at claim time instead, by a backend signature naming the
    // claimer, which is when their address finally exists.
    const envelopeType = recipientAddr ? 1 : 0;

    const createCalldata = socialPaymentsInterface.encodeFunctionData('createRedEnvelopeExtended', [
      tokenInfo.address,
      amountWei,
      1, // count = 1 (single recipient claim)
      false, // isRandom = false
      claimHash,
      deadlineOnChain,
      envelopeType,
      customRecipient,
      amountWei
    ]);

    const rawCreateData = ethers.getBytes(createCalldata);
    const createDataLenBuffer = Buffer.alloc(4);
    createDataLenBuffer.writeUInt32BE(rawCreateData.length, 0);

    const createPayload = ethers.hexlify(ethers.concat([
      typeByte,
      ethers.zeroPadValue(this.socialPaymentsAddress, 32),
      zeroValueBytes,
      createDataLenBuffer,
      rawCreateData
    ]));

    const createResult = await this.relayerService.executeLocalSessionAction(
      dto.senderUserId,
      senderUser.smartWallet!.address,
      decryptedKey,
      createPayload,
      dto.amount,
      nonce + 1
    );

    if (!createResult.success) {
      throw new BadRequestException(`On-chain escrow creation failed: ${createResult.message}`);
    }
    this.logger.log(`✅ On-chain escrow created: ${createResult.txHash}`);

    // 7. Extract envelope ID from event logs
    let onChainEnvelopeId = '0';
    try {
      const receipt = await this.provider.getTransactionReceipt(createResult.txHash!);
      if (receipt) {
        for (const log of receipt.logs) {
          try {
            const parsed = socialPaymentsInterface.parseLog(log);
            if (parsed?.name === 'RedEnvelopeCreated') {
              onChainEnvelopeId = parsed.args[0].toString();
              break;
            }
          } catch {}
        }
      }
    } catch {}

    if (onChainEnvelopeId === '0') {
      // Fallback: read envelopeCount from contract
      const countAbi = ['function envelopeCount() view returns (uint256)'];
      const countContract = new ethers.Contract(this.socialPaymentsAddress, countAbi, this.provider);
      const currentCount = await countContract.envelopeCount();
      onChainEnvelopeId = currentCount.toString();
    }

    // 8. No merkle root is committed at creation.
    //
    // `claimRedEnvelopeMerkle` builds its leaf from `msg.sender`, so a proof
    // can only be constructed once the claimer's address is known — which for
    // an unregistered recipient is never true at send time. Claims therefore
    // go through `claimRedEnvelope`, authorized by a backend signature minted
    // against the actual claimer. The previous code computed a leaf, discarded
    // it, and stored an empty proof against a zero root, which could not verify.
    const merkleProof = JSON.stringify([]);

    // 9. Create short link record
    const deadlineDate = new Date(deadlineOnChain * 1000);
    const cleanTargetHandle = dto.recipientHandle.replace(/^@/, '');
    const shortLink = await this.shortLinksService.create({
      kind: 'pay',
      senderUserId: dto.senderUserId,
      targetUserId: cleanTargetHandle,
      toAddress: recipientAddr || undefined,
      amount: dto.amount,
      token: tokenSymbol,
      fromUser: dto.fromUser || senderUser.username || '@sender',
      platform: dto.platform,
      envelopeId: onChainEnvelopeId,
      merkleProof,
      fundingTxHash: createResult.txHash,
      expiresAt: deadlineDate,
    });

    this.logger.log(`Created escrow claim link code=${shortLink.code} envelopeId=${onChainEnvelopeId}`);

    return {
      code: shortLink.code,
      shortUrl: shortLink.shortUrl,
      envelopeId: onChainEnvelopeId,
      toAddress: recipientAddr,
      amount: dto.amount,
      token: tokenSymbol,
    };
  }

  /**
   * Executes gasless claim releasing tokens from SocialPayments escrow to claimer's vault.
   */
  async claim(code: string, claimerUserId: string, claimerAddress: string) {
    // Rate limiting: max 5 attempts per code per 15 minutes.
    //
    // Held in Redis, not an in-process Map. The previous Map was per-replica and
    // per-process: an attacker reached a fresh allowance simply by landing on
    // another pod, and every deploy reset the counter for everyone. On a public
    // claim flow that is the appearance of a rate limit rather than one.
    //
    // @see docs/security-remaining-issues.md — BE-H-02
    const WINDOW_MS = 15 * 60 * 1000;
    const MAX_ATTEMPTS = 5;
    const rateLimitKey = `escrow:claim:${code}:${claimerAddress.toLowerCase()}`;

    const { totalHits } = await this.redis.increment(rateLimitKey, WINDOW_MS);
    if (totalHits > MAX_ATTEMPTS) {
      throw new ForbiddenException('Too many claim attempts. Please try again later.');
    }

    const link = await this.shortLinksService.resolve(code);

    if (link.status !== 'ACTIVE') {
      throw new BadRequestException(`Claim link is no longer active (status: ${link.status})`);
    }

    if (link.expiresAt && link.expiresAt < new Date()) {
      throw new BadRequestException('Claim link has expired');
    }

    let resolvedUserId = claimerUserId;
    let claimerUser: any = null;
    try {
      claimerUser = await this.prisma.user.findFirst({
        where: {
          OR: [
            { id: claimerUserId },
            { smartWallet: { address: { equals: claimerAddress, mode: 'insensitive' } } },
          ],
        },
        include: { smartWallet: true },
      });
      if (claimerUser) {
        resolvedUserId = claimerUser.id;
      }
    } catch (e) {
      this.logger.warn(`Failed to resolve claimer user: ${e}`);
    }

    // Authorization: verify claimer matches designated recipient or target handle
    let isAuthorized = false;
    if (!link.toAddress && !link.targetUserId) {
      isAuthorized = true;
    } else if (link.toAddress && link.toAddress.toLowerCase() === claimerAddress.toLowerCase()) {
      isAuthorized = true;
    } else if (link.targetUserId) {
      const cleanTarget = link.targetUserId.replace(/^@/, '').toLowerCase();
      if (link.targetUserId === claimerUserId || link.targetUserId === resolvedUserId) {
        isAuthorized = true;
      } else if (claimerUser) {
        const handles = [
          claimerUser.username,
          claimerUser.telegramId,
          claimerUser.whatsappId,
          claimerUser.discordId,
          claimerUser.slackId,
        ].filter(Boolean).map((h: string) => h.replace(/^@/, '').toLowerCase());

        if (handles.includes(cleanTarget)) {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      const displayTarget = link.targetUserId?.startsWith('@') ? link.targetUserId : `@${link.targetUserId}`;
      throw new ForbiddenException(`This payment was sent specifically to ${displayTarget}`);
    }

    if (!this.socialPaymentsAddress) {
      throw new BadRequestException('SOCIAL_PAYMENTS_ADDRESS not configured');
    }

    const envelopeId = link.envelopeId;
    if (!envelopeId) {
      throw new BadRequestException('Claim link missing envelope ID');
    }

    const amountWei = ethers.parseUnits((link.amount || 0).toString(), 6);

    // The escrow pays out with `safeTransfer(msg.sender, …)`, so the claim must
    // originate from the claimer's own vault. Relaying it directly would have
    // made the relayer `msg.sender` and sent the recipient's money to us.
    let claimerVault = claimerUser?.smartWallet?.address;
    if (!claimerVault) {
      throw new BadRequestException('No smart account found for the claimer. Complete wallet setup and retry.');
    }
    // Reassigned: deployment may repair a legacy address that the current
    // factory cannot deploy, and only the returned address ends up with code.
    claimerVault = await this.relayerService.ensureVaultDeployed(claimerVault);

    const claimerSession = await this.prisma.sessionKey.findFirst({
      where: { userId: resolvedUserId, revokedAt: null, expiryAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!claimerSession) {
      throw new BadRequestException('No active session key for the claimer. Re-authorize a session key and retry.');
    }

    // `claimRedEnvelope` verifies a backend signature over the claimer's own
    // address, which is why it works here where the merkle path cannot: the
    // address does not exist until this moment.
    const { chainId } = await this.provider.getNetwork();
    const claimDigest = ethers.solidityPackedKeccak256(
      ['uint256', 'address', 'uint256', 'address', 'uint256'],
      [chainId, this.socialPaymentsAddress, BigInt(envelopeId), claimerVault, amountWei],
    );
    const backendSignature = await this.relayerSigner.signMessage(ethers.getBytes(claimDigest));

    const claimCalldata = new ethers.Interface([
      'function claimRedEnvelope(uint256 id, uint256 claimAmount, bytes calldata backendSignature)',
    ]).encodeFunctionData('claimRedEnvelope', [BigInt(envelopeId), amountWei, backendSignature]);

    const rawClaimData = ethers.getBytes(claimCalldata);
    const claimLenBuffer = Buffer.alloc(4);
    claimLenBuffer.writeUInt32BE(rawClaimData.length, 0);
    const claimPayload = ethers.hexlify(ethers.concat([
      Buffer.from([2]), // ACTION_EXECUTE
      ethers.zeroPadValue(this.socialPaymentsAddress, 32),
      ethers.ZeroHash,
      claimLenBuffer,
      rawClaimData,
    ]));

    let txHash: string;
    try {
      const claimerKey = await this.relayerService.decryptSessionKey(claimerSession);
      const sessionKeyHash = ethers.keccak256(
        ethers.solidityPacked(['address'], [new ethers.Wallet(claimerKey).address]),
      );
      let claimNonce = 0;
      try {
        const vault = new ethers.Contract(
          claimerVault,
          ['function localSessionNonces(bytes32 sessionKeyHash) view returns (uint256)'],
          this.provider,
        );
        claimNonce = Number(await vault.localSessionNonces(sessionKeyHash));
      } catch {
        claimNonce = 0;
      }

      const result = await this.relayerService.executeLocalSessionAction(
        resolvedUserId,
        claimerVault,
        claimerKey,
        claimPayload,
        link.amount || 0,
        claimNonce,
        // Claiming credits the vault. Session spend caps exist to limit what a
        // stolen key can take out, so applying them here would only stop the
        // rightful owner from receiving money already escrowed for them.
        { inbound: true },
      );
      if (!result.success || !result.txHash) {
        throw new Error(result.message || 'Claim transaction failed');
      }
      txHash = result.txHash;
    } catch (e: any) {
      this.logger.error(`On-chain claim failed for code=${code}: ${e.message}`, e.stack);
      if (e.message?.includes('Envelope expired')) {
        await this.prisma.shortLink.update({
          where: { code },
          data: { status: 'EXPIRED' },
        });
        throw new BadRequestException('This claim link has expired on-chain.');
      }
      throw new BadRequestException(`Claim failed: ${e.message}`);
    }

    // Update shortlink status only after confirmed on-chain
    await this.shortLinksService.redeem(code, resolvedUserId, txHash);

    // Record activity log
    await this.activityService?.record({
      userIdentifier: resolvedUserId,
      action: UserActivityAction.ENVELOPE_CLAIMED,
      amount: link.amount || 0,
      token: link.token || 'USDC',
      txHash,
      metadata: { code, envelopeId, senderUserId: link.senderUserId },
    });

    // A recipient who claimed from a handle alone still has no platform id, so
    // the bot cannot reach them and their next bot message would otherwise
    // create a second account. Sending them into the bot now is what supplies
    // the numeric id that `IdentityService.resolveUser` adopts this account
    // with, so surface the link and let the UI insist on it.
    const claimer = await this.prisma.user.findUnique({ where: { id: resolvedUserId } });
    const needsPlatformLink = isProvisionalPlatformId(claimer?.telegramId);

    return {
      success: true,
      txHash,
      amount: link.amount,
      token: link.token,
      needsPlatformLink,
      botLink: needsPlatformLink ? getTelegramDeepLink(`claimed_${code}`) : null,
    };
  }

  /**
   * Lists a sender's escrows that are still outstanding and therefore cancellable.
   */
  async listCancellable(senderUserId: string) {
    const links = await this.prisma.shortLink.findMany({
      where: { senderUserId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return links.map((l) => ({
      code: l.code,
      amount: l.amount,
      token: l.token,
      recipient: l.targetUserId,
      createdAt: l.createdAt,
      expiresAt: l.expiresAt,
      // Links with no envelope id never made it on-chain; cancelling them only
      // retires the record, it does not move money.
      escrowed: Boolean(l.envelopeId),
    }));
  }

  /**
   * Cancels an unclaimed escrow and returns the funds to the sender.
   *
   * The DB status alone used to be flipped here, which told senders their
   * payment was cancelled while the tokens stayed locked in `SocialPayments`
   * until the 30-day deadline. The on-chain release is the substance of a
   * cancellation, so it happens first and the record only follows once it has
   * actually succeeded.
   *
   * `cancelEnvelope` (not `refundUnclaimedEnvelope`) is used deliberately: the
   * refund path requires the deadline to have passed, so it cannot serve a
   * sender who wants their money back now.
   */
  async cancelClaimLink(code: string, senderUserId: string) {
    const link = await this.prisma.shortLink.findUnique({ where: { code } });
    if (!link) throw new BadRequestException('Claim link not found.');

    // Only the sender may cancel. An unowned legacy link is not cancellable by
    // an arbitrary caller.
    if (!link.senderUserId || link.senderUserId !== senderUserId) {
      throw new ForbiddenException('Only the sender can cancel this payment.');
    }

    if (link.status === 'CLAIMED') {
      throw new BadRequestException('This payment has already been claimed and cannot be cancelled.');
    }
    if (link.status !== 'ACTIVE') {
      throw new BadRequestException(`This payment is no longer active (status: ${link.status}).`);
    }

    let txHash: string | null = null;

    if (link.envelopeId) {
      const sender = await this.prisma.user.findUnique({
        where: { id: senderUserId },
        include: { smartWallet: true },
      });
      let vault = sender?.smartWallet?.address;
      if (!vault) throw new BadRequestException('Sender smart account not found.');

      // `cancelEnvelope` requires msg.sender == envelope.creator, which is the
      // sender's vault — the relayer cannot call it on their behalf.
      // Reassigned: see the claim path above — a repaired wallet deploys at a
      // different address than the row originally held.
      vault = await this.relayerService.ensureVaultDeployed(vault);

      const session = await this.prisma.sessionKey.findFirst({
        where: { userId: senderUserId, revokedAt: null, expiryAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      });
      if (!session) {
        throw new BadRequestException('No active session key. Re-authorize a session key and retry.');
      }

      const sessionKey = await this.relayerService.decryptSessionKey(session);
      const sessionKeyHash = ethers.keccak256(
        ethers.solidityPacked(['address'], [new ethers.Wallet(sessionKey).address]),
      );
      let nonce = 0;
      try {
        const vaultContract = new ethers.Contract(
          vault,
          ['function localSessionNonces(bytes32 sessionKeyHash) view returns (uint256)'],
          this.provider,
        );
        nonce = Number(await vaultContract.localSessionNonces(sessionKeyHash));
      } catch {
        nonce = 0;
      }

      const calldata = new ethers.Interface([
        'function cancelEnvelope(uint256 id)',
      ]).encodeFunctionData('cancelEnvelope', [BigInt(link.envelopeId)]);

      const raw = ethers.getBytes(calldata);
      const lenBuffer = Buffer.alloc(4);
      lenBuffer.writeUInt32BE(raw.length, 0);
      const payload = ethers.hexlify(ethers.concat([
        Buffer.from([2]), // ACTION_EXECUTE
        ethers.zeroPadValue(this.socialPaymentsAddress, 32),
        ethers.ZeroHash,
        lenBuffer,
        raw,
      ]));

      const result = await this.relayerService.executeLocalSessionAction(
        senderUserId,
        vault,
        sessionKey,
        payload,
        0,
        nonce,
        // A cancellation returns money to this vault, so session spend caps
        // must not gate it for the same reason they do not gate claims.
        { inbound: true },
      );

      if (!result.success || !result.txHash) {
        this.logger.error(`On-chain cancel failed for code=${code}: ${result.message}`);
        throw new BadRequestException(
          `Could not return your funds on-chain: ${result.message ?? 'unknown error'}. Nothing was changed.`,
        );
      }
      txHash = result.txHash;
      this.logger.log(`✅ Escrow ${link.envelopeId} cancelled and refunded: ${txHash}`);
    } else {
      this.logger.warn(`Cancelling link ${code} with no envelope id — no on-chain escrow to release.`);
    }

    await this.prisma.shortLink.update({
      where: { code },
      data: { status: 'CANCELLED' },
    });

    await this.activityService?.record({
      userIdentifier: senderUserId,
      action: UserActivityAction.ENVELOPE_CANCELLED,
      amount: link.amount || 0,
      token: link.token || 'USDC',
      txHash: txHash ?? undefined,
      metadata: { code, envelopeId: link.envelopeId, recipient: link.targetUserId },
    });

    return {
      success: true,
      code,
      txHash,
      amount: link.amount,
      token: link.token,
      recipient: link.targetUserId,
      refunded: Boolean(link.envelopeId),
    };
  }
}
