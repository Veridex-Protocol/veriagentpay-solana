import { Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';
import type { ThrottlerStorage } from '@nestjs/throttler';

export interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/** Shared Redis access for security controls that must work across replicas. */
/**
 * Throttle keys where the rate limit is the security control itself, so losing
 * it must fail closed rather than open.
 */
const RATE_LIMIT_CRITICAL = /(otp|challenge|verify|login|auth)/i;

@Injectable()
export class RedisService implements OnModuleDestroy, ThrottlerStorage {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor() {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL is required');
    this.client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    this.client.on('error', (error) => this.logger.error(`Redis error: ${error.message}`));
  }

  private async ready(): Promise<Redis> {
    if (this.client.status === 'wait') await this.client.connect();
    return this.client;
  }

  async ping(): Promise<boolean> {
    return (await (await this.ready()).ping()) === 'PONG';
  }

  async claimOnce(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await (await this.ready()).set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async exists(key: string): Promise<boolean> {
    return (await (await this.ready()).exists(key)) === 1;
  }

  async setValue(key: string, value: string, ttlSeconds: number): Promise<void> {
    await (await this.ready()).set(key, value, 'EX', ttlSeconds);
  }

  async increment(key: string, ttl: number): Promise<ThrottlerStorageRecord> {
    const script = `
      local hits = redis.call('INCR', KEYS[1])
      if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
      local remaining = redis.call('PTTL', KEYS[1])
      return { hits, remaining }
    `;
    let totalHits: number;
    let remaining: number;
    try {
      [totalHits, remaining] = await (await this.ready()).eval(
        script,
        1,
        `throttle:${key}`,
        ttl,
      ) as [number, number];
    } catch (err: any) {
      // Rate limiting fails open.
      //
      // `ThrottlerGuard` has no error handling of its own, so a throw here
      // propagates as a 500 — an unreachable Redis took down every endpoint,
      // including unauthenticated ones like `/api/status/relayer`. Losing the
      // rate limiter for the length of a Redis outage is a smaller problem than
      // losing the API, and the limits protecting funds are enforced on-chain
      // by the spending caps, not here.
      //
      // Note this is a deliberate availability-over-enforcement trade. If a
      // deployment would rather shed load than serve unlimited requests, this
      // is the line to change.
      // Refined: the availability trade above holds for ordinary traffic, but
      // not for the endpoints where the rate limit *is* the control. An OTP is
      // six digits — unlimited attempts is the whole attack — and challenge
      // issuance is what a credential-stuffing run consumes. For those, shed
      // the request rather than remove the only thing bounding guesses.
      //
      // @see docs/security-remediation-plan.md — BE-H-07
      if (RATE_LIMIT_CRITICAL.test(key)) {
        this.logger.error(
          `Throttler storage unavailable; refusing rate-limited request for "${key}".`,
        );
        throw new ServiceUnavailableException(
          'This service is temporarily unavailable. Please try again shortly.',
        );
      }

      this.logger.warn(`Throttler storage unavailable, allowing request: ${err.message}`);
      return { totalHits: 0, timeToExpire: Math.ceil(ttl / 1000), isBlocked: false, timeToBlockExpire: 0 };
    }

    // `isBlocked` / `timeToBlockExpire` belong to the throttler's block-duration
    // feature, which is not configured here the guard decides on `totalHits`
    // against the per-tier limit. They are reported as "not blocked" rather than
    // omitted so this satisfies the ThrottlerStorage contract.
    return {
      totalHits: Number(totalHits),
      timeToExpire: Math.max(0, Math.ceil(Number(remaining) / 1000)),
      isBlocked: false,
      timeToBlockExpire: 0,
    };
  }

  async setJson(key: string, value: unknown, ttlMs: number): Promise<void> {
    await (await this.ready()).set(key, JSON.stringify(value), 'PX', ttlMs);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await (await this.ready()).get(key);
    return raw ? JSON.parse(raw) as T : null;
  }

  async del(key: string): Promise<void> {
    await (await this.ready()).del(key);
  }

  async delByPrefix(prefix: string): Promise<number> {
    const client = await this.ready();
    let cursor = '0';
    let deleted = 0;
    do {
      const [next, keys] = await client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 200);
      cursor = next;
      if (keys.length > 0) {
        await client.del(...keys);
        deleted += keys.length;
      }
    } while (cursor !== '0');
    return deleted;
  }

  async takeJson<T>(key: string): Promise<T | null> {
    const raw = await (await this.ready()).getdel(key);
    return raw ? JSON.parse(raw) as T : null;
  }

  /**
   * Atomically checks cumulative spending against a limit and increments it.
   * Eliminates TOCTOU race conditions during concurrent burst transactions (NEW-M-01).
   */
  async atomicCheckAndIncrementSpend(
    key: string,
    txAmountUSD: number,
    dailyLimitUSD: number,
    ttlMs: number = 86400_000,
  ): Promise<{ allowed: boolean; currentSpent: number; newTotal: number }> {
    const script = `
      local current = redis.call('GET', KEYS[1])
      local currentSpent = 0
      if current then
        local num = tonumber(current)
        if num then
          currentSpent = num
        else
          local jsonMatch = string.match(current, '"totalUSD"%s*:%s*([%d%.]+)')
          if jsonMatch then
            currentSpent = tonumber(jsonMatch) or 0
          end
        end
      end

      local txAmount = tonumber(ARGV[1])
      local dailyLimit = tonumber(ARGV[2])
      local ttlMs = tonumber(ARGV[3])

      if (currentSpent + txAmount) > dailyLimit then
        return { 0, tostring(currentSpent), tostring(currentSpent) }
      end

      local newTotal = currentSpent + txAmount
      local pttl = redis.call('PTTL', KEYS[1])
      if pttl > 0 then
        redis.call('SET', KEYS[1], tostring(newTotal), 'PX', pttl)
      else
        redis.call('SET', KEYS[1], tostring(newTotal), 'PX', ttlMs)
      end
      return { 1, tostring(currentSpent), tostring(newTotal) }
    `;

    const client = await this.ready();
    const result = (await client.eval(
      script,
      1,
      key,
      txAmountUSD.toString(),
      dailyLimitUSD.toString(),
      ttlMs.toString(),
    )) as [number, string, string];

    const allowed = result[0] === 1;
    const currentSpent = parseFloat(result[1]) || 0;
    const newTotal = parseFloat(result[2]) || 0;

    return { allowed, currentSpent, newTotal };
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status !== 'end') await this.client.quit().catch(() => this.client.disconnect());
  }
}
