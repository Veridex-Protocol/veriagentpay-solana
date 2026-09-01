import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from './redis.service';

export interface CachedSessionKey {
  id: string;
  userId: string;
  keyHash: string;
  encryptedKey: string;
  encryptedSymmetricKey?: string | null;
  perTxLimitUSD: number;
  dailyLimitUSD: number;
  expiryAt: Date;
  revokedAt?: Date | null;
}

const SK_PREFIX = 'hotstate:sk:';
const H2A_PREFIX = 'hotstate:h2a:';
const A2H_PREFIX = 'hotstate:a2h:';
const SPEND_PREFIX = 'hotstate:spend:';
const IDEM_PREFIX = 'hotstate:idem:';

@Injectable()
export class HotStateService implements OnModuleInit {
  private readonly logger = new Logger(HotStateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async checkAndSetIdempotencyKey(key: string, ttlSeconds: number = 300): Promise<{ isDuplicate: boolean; cachedResult?: any }> {
    const existing = await this.redis.getJson<{ result: any }>(`${IDEM_PREFIX}${key}`);
    if (existing) {
      return { isDuplicate: true, cachedResult: existing.result };
    }
    await this.redis.setJson(`${IDEM_PREFIX}${key}`, { result: null }, ttlSeconds * 1000);
    return { isDuplicate: false };
  }

  async saveIdempotencyResult(key: string, result: any): Promise<void> {
    const existing = await this.redis.getJson<{ result: any }>(`${IDEM_PREFIX}${key}`);
    if (existing) {
      await this.redis.setJson(`${IDEM_PREFIX}${key}`, { result }, 300_000);
    } else {
      await this.redis.setJson(`${IDEM_PREFIX}${key}`, { result }, 300_000);
    }
  }

  async onModuleInit() {
    const start = process.hrtime.bigint();
    this.logger.log('Warming HotStateService Redis caches from database...');

    try {
      await this.redis.delByPrefix('hotstate:');

      const users = await this.prisma.user.findMany({
        select: {
          username: true,
          telegramId: true,
          whatsappId: true,
          discordId: true,
          slackId: true,
          smartWallet: { select: { address: true } },
        },
      });

      let handleCount = 0;
      for (const u of users) {
        if (u.smartWallet?.address) {
          const addr = u.smartWallet.address;
          const primaryHandle = u.username ? `@${u.username}` : u.telegramId ? `@${u.telegramId}` : u.whatsappId || addr;
          await this.redis.setJson(`${A2H_PREFIX}${addr.toLowerCase()}`, primaryHandle, 86400_000 * 30);

          if (u.username) { await this.redis.setJson(`${H2A_PREFIX}${this.normalizeHandle(u.username)}`, addr, 86400_000 * 30); handleCount++; }
          if (u.telegramId) { await this.redis.setJson(`${H2A_PREFIX}${this.normalizeHandle(u.telegramId)}`, addr, 86400_000 * 30); handleCount++; }
          if (u.whatsappId) { await this.redis.setJson(`${H2A_PREFIX}${this.normalizeHandle(u.whatsappId)}`, addr, 86400_000 * 30); handleCount++; }
          if (u.discordId) { await this.redis.setJson(`${H2A_PREFIX}${this.normalizeHandle(u.discordId)}`, addr, 86400_000 * 30); handleCount++; }
          if (u.slackId) { await this.redis.setJson(`${H2A_PREFIX}${this.normalizeHandle(u.slackId)}`, addr, 86400_000 * 30); handleCount++; }
        }
      }

      const socialNodes = await this.prisma.socialNode.findMany({
        include: { user: { include: { smartWallet: true } } },
      });
      for (const node of socialNodes) {
        if (node.user?.smartWallet?.address) {
          const addr = node.user.smartWallet.address;
          const handle = node.username ? (node.username.startsWith('@') ? node.username : `@${node.username}`) : node.platformUserId;
          await this.redis.setJson(`${A2H_PREFIX}${addr.toLowerCase()}`, handle, 86400_000 * 30);
          if (node.username) { await this.redis.setJson(`${H2A_PREFIX}${this.normalizeHandle(node.username)}`, addr, 86400_000 * 30); handleCount++; }
          if (node.platformUserId) { await this.redis.setJson(`${H2A_PREFIX}${this.normalizeHandle(node.platformUserId)}`, addr, 86400_000 * 30); handleCount++; }
        }
      }

      const activeKeys = await this.prisma.sessionKey.findMany({
        where: {
          revokedAt: null,
          expiryAt: { gt: new Date() },
        },
      });
      let skCount = 0;
      for (const key of activeKeys) {
        const ttlMs = key.expiryAt.getTime() - Date.now();
        if (ttlMs <= 0) continue;
        const cached: CachedSessionKey = {
          id: key.id,
          userId: key.userId,
          keyHash: key.keyHash,
          encryptedKey: key.encryptedKey,
          encryptedSymmetricKey: key.encryptedSymmetricKey,
          perTxLimitUSD: Number(key.perTxLimitUSD),
          dailyLimitUSD: Number(key.dailyLimitUSD),
          expiryAt: key.expiryAt,
          revokedAt: key.revokedAt,
        };
        await this.redis.setJson(`${SK_PREFIX}${key.keyHash}`, cached, ttlMs);
        skCount++;
      }

      const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const spending = await this.prisma.spendingRecord.groupBy({
        by: ['sessionKeyId'],
        where: { timestamp: { gte: last24h } },
        _sum: { amountUSD: true },
      });
      for (const s of spending) {
        await this.redis.setJson(`${SPEND_PREFIX}${s.sessionKeyId}`, { totalUSD: Number(s._sum.amountUSD || 0) }, 86400_000);
      }

      const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
      this.logger.log(
        `HotStateService Redis cache warmed in ${elapsedMs.toFixed(2)}ms (${handleCount} handles, ${skCount} session keys).`
      );
    } catch (err: any) {
      this.logger.error(`Failed to warm HotStateService cache: ${err.message}`, err.stack);
    }
  }

  private normalizeHandle(handle: string): string {
    return handle.trim().replace(/^@/, '');
  }

  async resolveHandle(handle: string): Promise<string | null> {
    if (!handle) return null;
    const normalized = this.normalizeHandle(handle);
    const raw = await this.redis.getJson<string>(`${H2A_PREFIX}${normalized}`);
    return raw || null;
  }

  async getHandleForAddress(address: string): Promise<string | null> {
    if (!address) return null;
    const raw = await this.redis.getJson<string>(`${A2H_PREFIX}${address.toLowerCase()}`);
    return raw || null;
  }

  async setHandleMapping(handle: string, address: string): Promise<void> {
    if (!handle || !address) return;
    try {
      const normalized = this.normalizeHandle(handle);
      await this.redis.setJson(`${H2A_PREFIX}${normalized}`, address, 86400_000 * 30);
      const displayHandle = handle.startsWith('@') ? handle : `@${handle}`;
      await this.redis.setJson(`${A2H_PREFIX}${address.toLowerCase()}`, displayHandle, 86400_000 * 30);
    } catch (err: any) {
      this.logger.warn(`Failed to set handle mapping ${handle} -> ${address}: ${err.message}`);
    }
  }

  async getSessionKey(keyHash: string): Promise<CachedSessionKey | null> {
    const key = await this.redis.getJson<CachedSessionKey>(`${SK_PREFIX}${keyHash}`);
    if (!key) return null;
    if (key.revokedAt || new Date(key.expiryAt) < new Date()) {
      await this.redis.del(`${SK_PREFIX}${keyHash}`);
      return null;
    }
    return key;
  }

  async setSessionKey(keyData: CachedSessionKey): Promise<void> {
    const ttlMs = new Date(keyData.expiryAt).getTime() - Date.now();
    if (ttlMs <= 0) return;
    await this.redis.setJson(`${SK_PREFIX}${keyData.keyHash}`, keyData, ttlMs);
  }

  async revokeSessionKey(keyHash: string): Promise<void> {
    await this.redis.del(`${SK_PREFIX}${keyHash}`);
  }

  async validateAndRecordSpending(
    sessionKeyHash: string,
    txAmountUSD: number,
    perTxLimitUSD: number,
    dailyLimitUSD: number
  ): Promise<{ allowed: boolean; reason?: string }> {
    const session = await this.getSessionKey(sessionKeyHash);
    if (!session) {
      return { allowed: false, reason: 'Session key is expired, revoked, or invalid' };
    }

    if (txAmountUSD > perTxLimitUSD) {
      return {
        allowed: false,
        reason: `Transaction ($${txAmountUSD}) exceeds single tx limit ($${perTxLimitUSD})`,
      };
    }

    const spendKey = `${SPEND_PREFIX}${session.id}`;
    const result = await this.redis.atomicCheckAndIncrementSpend(
      spendKey,
      txAmountUSD,
      dailyLimitUSD,
      86400_000,
    );

    if (!result.allowed) {
      return {
        allowed: false,
        reason: `Cumulative spending ($${(result.currentSpent + txAmountUSD).toFixed(2)}) exceeds daily limit ($${dailyLimitUSD})`,
      };
    }

    return { allowed: true };
  }

  async recordSpendingAsync(sessionKeyId: string, txAmountUSD: number, txHash: string): Promise<void> {
    setImmediate(async () => {
      try {
        await this.prisma.spendingRecord.create({
          data: {
            sessionKeyId,
            amountUSD: txAmountUSD,
            txHash,
          },
        });
      } catch (err: any) {
        this.logger.error(`Async spending record DB sync failed: ${err.message}`);
      }
    });
  }
}
