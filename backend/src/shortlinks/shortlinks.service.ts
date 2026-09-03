import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { customAlphabet } from 'nanoid';
import { getAppBaseUrl } from '../config/app-url.config';
import { isSolanaAddress } from '../chains/solana/solana-account';

const base62Alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const generateNanoid = customAlphabet(base62Alphabet, 8);

export interface CreateShortLinkDto {
  kind: 'pay' | 'envelope' | 'request' | 'referral';
  senderUserId?: string;
  targetUserId?: string;
  toAddress?: string;
  amount?: number;
  token?: string;
  fromUser?: string;
  platform?: string;
  envelopeId?: string;
  merkleProof?: string;
  /** Transaction that funded an on-chain social-payment escrow. */
  fundingTxHash?: string;
  expiresAt?: Date;
  status?: string;
  /** Campaign attribution, persisted so every click is measurable. */
  src?: string;
  campaign?: string;
  partner?: string;
  channel?: string;
  refCode?: string;
}

/** Attribution appended to shareable URLs. */
export interface LinkAttribution {
  ref?: string;
  src?: string;
  campaign?: string;
  partner?: string;
  channel?: string;
}

/**
 * Appends attribution params to a URL, skipping any that are already present so
 * an explicit value in the base URL always wins.
 */
export function withAttribution(url: string, attribution: LinkAttribution): string {
  const entries = Object.entries(attribution).filter(([, v]) => Boolean(v)) as [string, string][];
  if (entries.length === 0) return url;

  try {
    const parsed = new URL(url);
    for (const [key, value] of entries) {
      if (!parsed.searchParams.has(key)) parsed.searchParams.set(key, value);
    }
    return parsed.toString();
  } catch {
    const separator = url.includes('?') ? '&' : '?';
    const query = entries
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    return `${url}${separator}${query}`;
  }
}

@Injectable()
export class ShortLinksService {
  private readonly prisma: PrismaService;

  constructor(prisma?: PrismaService) {
    this.prisma = prisma || new PrismaService();
  }

  /**
   * Generates a collision-checked 8-character base62 short link code and persists it.
   */
  async create(dto: CreateShortLinkDto) {
    let code = generateNanoid();
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      const existing = await this.prisma.shortLink.findUnique({ where: { code } });
      if (!existing) break;
      code = generateNanoid();
      attempts++;
    }

    if (attempts >= maxAttempts) {
      throw new BadRequestException('Failed to generate a unique short link code after multiple attempts');
    }

    const defaultExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const record = await this.prisma.shortLink.create({
      data: {
        code,
        kind: dto.kind,
        senderUserId: dto.senderUserId || null,
        targetUserId: dto.targetUserId || null,
        toAddress: dto.toAddress || null,
        amount: dto.amount || null,
        token: dto.token || 'USDC',
        fromUser: dto.fromUser || null,
        platform: dto.platform || null,
        envelopeId: dto.envelopeId || null,
        merkleProof: dto.merkleProof || null,
        fundingTxHash: dto.fundingTxHash || null,
        expiresAt: dto.expiresAt || defaultExpiry,
        status: dto.status || 'ACTIVE',
        src: dto.src || dto.platform || null,
        campaign: dto.campaign || dto.kind,
        partner: dto.partner || null,
        channel: dto.channel || null,
        refCode: dto.refCode || null,
      },
    });

    const baseUrl = getAppBaseUrl();
    const shortUrl = withAttribution(`${baseUrl.replace(/\/$/, '')}/c/${code}`, {
      src: record.src || undefined,
      campaign: record.campaign || undefined,
      partner: record.partner || undefined,
      channel: record.channel || undefined,
      ref: record.refCode || undefined,
    });

    return {
      code: record.code,
      shortUrl,
      record,
    };
  }

  /**
   * Resolves a short link by code and increments click count.
   */
  async resolve(code: string) {
    const record = await this.prisma.shortLink.findUnique({ where: { code } });
    if (!record) {
      throw new NotFoundException(`Short link code '${code}' not found`);
    }

    const isExpired = record.expiresAt && new Date(record.expiresAt) < new Date();
    if (record.status === 'ACTIVE' && isExpired && !isNativeSolanaPaymentLink(record)) {
      await this.prisma.shortLink.update({
        where: { code },
        data: { status: 'EXPIRED' },
      });
      record.status = 'EXPIRED';
    }

    // Increment click count asynchronously
    await this.prisma.shortLink.update({
      where: { code },
      data: { clickCount: { increment: 1 } },
    });

    return record;
  }

  /**
   * Redeems a short link upon successful claim on-chain.
   */
  async redeem(code: string, claimerUserId: string, txHash: string) {
    const record = await this.resolve(code);
    if (record.status !== 'ACTIVE') {
      throw new BadRequestException(`Short link code '${code}' is no longer active (status: ${record.status})`);
    }

    if (record.expiresAt && record.expiresAt < new Date() && !isNativeSolanaPaymentLink(record)) {
      await this.prisma.shortLink.update({
        where: { code },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException(`Short link code '${code}' has expired`);
    }

    // Recipient authorization is completed by EscrowService before it submits
    // the on-chain claim. At this point `claimerUserId` is the verified
    // account's UUID, while `targetUserId` may be a social handle such as
    // `@lordzenith0`; comparing those unrelated identifiers rejects every
    // legitimate handle-based claim after the funds have already moved.

    const updated = await this.prisma.shortLink.update({
      where: { code },
      data: {
        status: 'CLAIMED',
        claimedAt: new Date(),
        claimedBy: claimerUserId,
        claimTxHash: txHash,
      },
    });

    return updated;
  }

  /**
   * Cancels an active short link created by the specified user.
   */
  async cancel(code: string, senderUserId: string) {
    const record = await this.resolve(code);
    if (record.senderUserId && record.senderUserId !== senderUserId) {
      throw new BadRequestException('Unauthorized to cancel this short link');
    }

    if (record.status !== 'ACTIVE') {
      throw new BadRequestException(`Cannot cancel short link with status '${record.status}'`);
    }

    const updated = await this.prisma.shortLink.update({
      where: { code },
      data: { status: 'CANCELLED' },
    });

    return updated;
  }

  /**
   * Sweeps expired links and updates status to EXPIRED.
   */
  async sweepExpired() {
    const now = new Date();
    const expiredLinks = await this.prisma.shortLink.findMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { lt: now },
      },
    });

    for (const link of expiredLinks) {
      if (isNativeSolanaPaymentLink(link)) continue;
      await this.prisma.shortLink.update({
        where: { id: link.id },
        data: { status: 'EXPIRED' },
      });
    }

    return expiredLinks.filter((link) => !isNativeSolanaPaymentLink(link));
  }
}

function isNativeSolanaPaymentLink(link: {
  kind: string;
  envelopeId?: string | null;
}): boolean {
  return link.kind === 'pay' && Boolean(link.envelopeId && isSolanaAddress(link.envelopeId));
}
