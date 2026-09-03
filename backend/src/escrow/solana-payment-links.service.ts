import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { UserActivityAction } from '@prisma/client';
import { PublicKey } from '@solana/web3.js';
import * as crypto from 'node:crypto';

import { ActivityService } from '../activity/activity.service';
import { isProvisionalPlatformId } from '../config/provisional-identity';
import { getTelegramDeepLink } from '../config/app-url.config';
import { RedisService } from '../core/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { SolanaRelayerService } from '../relayer/solana-relayer.service';
import { ShortLinksService } from '../shortlinks/shortlinks.service';
import type { CreateEscrowLinkDto } from './escrow.service';

const CLAIM_WINDOW_MS = 15 * 60 * 1000;
const MAX_CLAIM_ATTEMPTS = 5;
const LINK_LIFETIME_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SolanaPaymentLinksService {
  private readonly logger = new Logger(SolanaPaymentLinksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shortLinks: ShortLinksService,
    private readonly relayer: SolanaRelayerService,
    private readonly redis: RedisService,
    private readonly activity?: ActivityService,
  ) {}

  async createClaimLink(dto: CreateEscrowLinkDto) {
    const token = (dto.token || 'USDC').toUpperCase();
    if (token !== 'USDC') {
      throw new BadRequestException('Native Solana payment links currently support USDC');
    }
    if (!Number.isFinite(dto.amount) || dto.amount <= 0) {
      throw new BadRequestException('Payment-link amount must be greater than zero');
    }

    const sender = await this.prisma.user.findUnique({
      where: { id: dto.senderUserId },
      include: {
        smartWallet: true,
        sessionKeys: {
          where: {
            revokedAt: null,
            expiryAt: { gt: new Date() },
            activatedAt: { not: null },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!sender?.smartWallet?.address) {
      throw new BadRequestException('Sender wallet setup is required before creating a payment link');
    }
    const session = sender.sessionKeys[0];
    if (!session) {
      const error = new BadRequestException('No active session key. Authorize a session key and retry.');
      (error as any).code = 'SESSION_KEY_REQUIRED';
      (error as any).requirePasskey = true;
      throw error;
    }

    await this.relayer.ensureVaultDeployed(sender.smartWallet.address);
    const expiresAt = new Date(Date.now() + LINK_LIFETIME_MS);
    const targetHandle = normalizeHandle(dto.recipientHandle);
    const shortLink = await this.shortLinks.create({
      kind: 'pay',
      senderUserId: sender.id,
      targetUserId: targetHandle,
      amount: dto.amount,
      token,
      fromUser: dto.fromUser || sender.username || 'sender',
      platform: dto.platform,
      expiresAt,
      status: 'PENDING',
    });

    const linkId = crypto.createHash('sha256').update(shortLink.code).digest();
    const recipientCommitment = paymentLinkRecipientCommitment(dto.platform, targetHandle);
    const sessionKey = await this.relayer.decryptSessionKey(session);
    let funded;
    try {
      funded = await this.relayer.createPaymentLinkWithSession({
        userId: sender.id,
        vaultAddress: sender.smartWallet.address,
        encryptedSessionKey: sessionKey,
        amountUSD: dto.amount,
        linkId,
        recipientCommitment,
        expiresAtUnix: BigInt(Math.floor(expiresAt.getTime() / 1000)),
      });
    } catch (error) {
      await this.prisma.shortLink.update({
        where: { code: shortLink.code },
        data: { status: 'FAILED' },
      }).catch(() => undefined);
      throw error;
    }

    await this.prisma.shortLink.update({
      where: { code: shortLink.code },
      data: {
        envelopeId: funded.paymentLink,
        fundingTxHash: funded.txHash,
        status: 'ACTIVE',
      },
    });
    this.logger.log(`Native Solana payment link funded: ${funded.paymentLink}`);

    return {
      code: shortLink.code,
      shortUrl: shortLink.shortUrl,
      envelopeId: funded.paymentLink,
      toAddress: null,
      amount: dto.amount,
      token,
      txHash: funded.txHash,
    };
  }

  async claim(code: string, claimerUserId: string, claimerAddress: string) {
    const rateLimitKey = `escrow:claim:${code}:${claimerAddress}`;
    const { totalHits } = await this.redis.increment(rateLimitKey, CLAIM_WINDOW_MS);
    if (totalHits > MAX_CLAIM_ATTEMPTS) {
      throw new ForbiddenException('Too many claim attempts. Please try again later.');
    }

    const link = await this.shortLinks.resolve(code);
    if (link.status !== 'ACTIVE') {
      throw new BadRequestException(`Claim link is no longer active (status: ${link.status})`);
    }
    if (link.expiresAt && link.expiresAt < new Date()) {
      await this.refundExpiredLink(link).catch((error) => {
        this.logger.error(`Expired payment-link refund failed for ${code}: ${error.message}`);
      });
      throw new BadRequestException('Claim link has expired');
    }
    if (!link.envelopeId) throw new BadRequestException('Claim link has no Solana escrow account');

    const claimer = await this.prisma.user.findFirst({
      where: {
        OR: [
          { id: claimerUserId },
          { smartWallet: { address: claimerAddress } },
        ],
      },
      include: { smartWallet: true },
    });
    if (!claimer?.smartWallet?.address) {
      throw new BadRequestException('Complete passkey wallet setup before claiming');
    }
    this.assertRecipient(link, claimer);
    await this.relayer.ensureVaultDeployed(claimer.smartWallet.address);

    const state = await this.relayer.readPaymentLink(link.envelopeId);
    if (!state || state.status !== 0) {
      throw new BadRequestException('The Solana payment link is no longer active');
    }
    const expectedCommitment = paymentLinkRecipientCommitment(
      link.platform || 'web',
      link.targetUserId || '',
    );
    if (!crypto.timingSafeEqual(Buffer.from(state.recipientCommitment), expectedCommitment)) {
      throw new ForbiddenException('Payment-link recipient binding does not match');
    }
    const expectedAmount = link.token === 'SOL'
      ? solToLamports(link.amount || 0)
      : usdcToAtomic(link.amount || 0);
    if (state.amount !== expectedAmount) {
      throw new BadRequestException('Payment-link amount does not match its on-chain escrow');
    }

    const result = await this.relayer.claimPaymentLink(
      link.envelopeId,
      claimer.smartWallet.address,
    );
    await this.shortLinks.redeem(code, claimer.id, result.txHash);
    await this.activity?.record({
      userIdentifier: claimer.id,
      action: UserActivityAction.ENVELOPE_CLAIMED,
      amount: link.amount || 0,
      token: link.token || 'USDC',
      txHash: result.txHash,
      metadata: {
        code,
        paymentLink: link.envelopeId,
        senderUserId: link.senderUserId,
        chain: 'solana',
      },
    });

    const needsPlatformLink = isProvisionalPlatformId(claimer.telegramId);
    return {
      success: true,
      txHash: result.txHash,
      amount: link.amount,
      token: link.token || 'USDC',
      needsPlatformLink,
      botLink: needsPlatformLink ? getTelegramDeepLink(`claimed_${code}`) : null,
    };
  }

  async listCancellable(senderUserId: string) {
    const links = await this.prisma.shortLink.findMany({
      where: { senderUserId, status: 'ACTIVE', kind: 'pay' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return links.map((link) => ({
      code: link.code,
      amount: link.amount,
      token: link.token,
      recipient: link.targetUserId,
      createdAt: link.createdAt,
      expiresAt: link.expiresAt,
      escrowed: Boolean(link.envelopeId),
    }));
  }

  async cancelClaimLink(code: string, senderUserId: string) {
    const link = await this.prisma.shortLink.findUnique({ where: { code } });
    if (!link) throw new BadRequestException('Claim link not found');
    if (link.senderUserId !== senderUserId) {
      throw new ForbiddenException('Only the sender can cancel this payment');
    }
    if (link.status !== 'ACTIVE') {
      throw new BadRequestException(`This payment is no longer active (status: ${link.status})`);
    }
    if (!link.envelopeId) throw new BadRequestException('Claim link has no Solana escrow account');
    if (link.token === 'SOL') {
      throw new BadRequestException('Native SOL payment links require passkey authorization to cancel');
    }

    const sender = await this.prisma.user.findUnique({
      where: { id: senderUserId },
      include: {
        smartWallet: true,
        sessionKeys: {
          where: {
            revokedAt: null,
            expiryAt: { gt: new Date() },
            activatedAt: { not: null },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!sender?.smartWallet?.address) throw new BadRequestException('Sender wallet not found');
    const session = sender.sessionKeys[0];
    if (!session) throw new BadRequestException('Authorize a session key before cancelling');
    const sessionKey = await this.relayer.decryptSessionKey(session);
    const result = await this.relayer.cancelPaymentLinkWithSession({
      userId: sender.id,
      vaultAddress: sender.smartWallet.address,
      paymentLinkAddress: link.envelopeId,
      encryptedSessionKey: sessionKey,
    });

    await this.prisma.shortLink.update({
      where: { code },
      data: { status: 'CANCELLED', claimTxHash: result.txHash },
    });
    await this.activity?.record({
      userIdentifier: sender.id,
      action: UserActivityAction.ENVELOPE_CANCELLED,
      amount: link.amount || 0,
      token: 'USDC',
      txHash: result.txHash,
      metadata: { code, paymentLink: link.envelopeId, chain: 'solana' },
    });
    return {
      success: true,
      code,
      txHash: result.txHash,
      amount: link.amount,
      token: 'USDC',
      recipient: link.targetUserId,
      refunded: true,
    };
  }

  async sweepExpired() {
    const links = await this.prisma.shortLink.findMany({
      where: {
        kind: 'pay',
        status: 'ACTIVE',
        expiresAt: { lt: new Date() },
        envelopeId: { not: null },
      },
    });
    const refunded = [];
    for (const link of links) {
      try {
        await this.refundExpiredLink(link);
        refunded.push(link);
      } catch (error: any) {
        this.logger.error(`Expired payment-link refund failed for ${link.code}: ${error.message}`);
      }
    }
    return refunded;
  }

  private assertRecipient(link: any, claimer: any) {
    if (link.toAddress && link.toAddress !== claimer.smartWallet.address) {
      throw new ForbiddenException('This payment belongs to another Solana vault');
    }
    if (!link.targetUserId) return;
    const target = normalizeHandle(link.targetUserId);
    const identities = [
      claimer.id,
      claimer.username,
      claimer.telegramId,
      claimer.whatsappId,
      claimer.discordId,
      claimer.slackId,
    ].filter(Boolean).map(normalizeHandle);
    if (!identities.includes(target)) {
      throw new ForbiddenException(`This payment was sent specifically to @${target}`);
    }
  }

  private async refundExpiredLink(link: any) {
    if (!link.envelopeId || !link.senderUserId) return;
    const sender = await this.prisma.user.findUnique({
      where: { id: link.senderUserId },
      include: { smartWallet: true },
    });
    if (!sender?.smartWallet?.address) return;
    const state = await this.relayer.readPaymentLink(link.envelopeId);
    if (!state) return;
    if (state.status !== 0) {
      await this.prisma.shortLink.update({
        where: { id: link.id },
        data: { status: paymentLinkStatus(state.status) },
      });
      return;
    }
    const result = await this.relayer.refundExpiredPaymentLink(
      sender.smartWallet.address,
      link.envelopeId,
    );
    await this.prisma.shortLink.update({
      where: { id: link.id },
      data: { status: 'EXPIRED', claimTxHash: result.txHash },
    });
  }
}

function paymentLinkStatus(status: number): string {
  if (status === 1) return 'CLAIMED';
  if (status === 2) return 'CANCELLED';
  if (status === 3) return 'EXPIRED';
  return 'ACTIVE';
}

export function paymentLinkRecipientCommitment(platform: string, handle: string): Buffer {
  return crypto.createHash('sha256')
    .update('veriagent:solana:payment-link-recipient:v1\0')
    .update(platform.toLowerCase())
    .update('\0')
    .update(normalizeHandle(handle))
    .digest();
}

function normalizeHandle(value: string): string {
  return value.trim().replace(/^@/, '').toLowerCase();
}

function usdcToAtomic(amount: number): bigint {
  if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('Invalid USDC amount');
  return BigInt(amount.toFixed(6).replace('.', ''));
}

function solToLamports(amount: number): bigint {
  if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('Invalid SOL amount');
  return BigInt(amount.toFixed(9).replace('.', ''));
}