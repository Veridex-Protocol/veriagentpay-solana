import { beforeAll, describe, expect, it, mock } from 'bun:test';

// `ReferralService` transitively reaches `@veridex/sdk`, which performs a
// synchronous require() of an ESM-only bundle and throws under the test runner.
// None of it is exercised here, so stub the module and load the service
// dynamically — a static import would hoist above the stub.
mock.module('@veridex/sdk', () => ({ PasskeyManager: class {} }));

let ReferralService: any;
let REFERRAL_REWARDS: any;
let REFERRAL_LIMITS: any;
let MIN_QUALIFYING_SEND_USD: number;

beforeAll(async () => {
  ({ ReferralService, REFERRAL_REWARDS, REFERRAL_LIMITS, MIN_QUALIFYING_SEND_USD } =
    await import('./referral.service'));
});

/**
 * Covers the staged-reward state machine and the anti-Sybil guardrails.
 *
 * The Prisma client is stubbed so these run without a database.
 */

type Row = Record<string, any>;

function createPrismaStub(seed: {
  users?: Row[];
  referralCodes?: Row[];
  referrals?: Row[];
}) {
  const users: Row[] = seed.users ?? [];
  const referralCodes: Row[] = seed.referralCodes ?? [];
  const referrals: Row[] = seed.referrals ?? [];
  const rewardPoints: Row[] = [];

  const matches = (row: Row, where: Row): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (value && typeof value === 'object' && 'gte' in value) return row[key] >= value.gte;
      return row[key] === value;
    });

  return {
    rewardPoints,
    referrals,
    referralCode: {
      findUnique: async ({ where }: any) =>
        referralCodes.find((c) => c.code === where.code || c.userId === where.userId) ?? null,
      update: async () => undefined,
      create: async ({ data }: any) => {
        referralCodes.push(data);
        return data;
      },
    },
    referral: {
      findUnique: async ({ where }: any) =>
        referrals.find((r) => r.refereeId === where.refereeId) ?? null,
      create: async ({ data }: any) => {
        // Mirror the schema defaults Prisma would apply on insert.
        const row = {
          id: `ref_${referrals.length}`,
          points: 0,
          walletCreated: false,
          firstSendCompleted: false,
          depositRetainedD7: false,
          createdAt: new Date(),
          ...data,
        };
        referrals.push(row);
        return row;
      },
      count: async ({ where }: any) => referrals.filter((r) => matches(r, where)).length,
      updateMany: async ({ where, data }: any) => {
        const target = referrals.find((r) => matches(r, where));
        if (!target) return { count: 0 };
        for (const [key, value] of Object.entries(data)) {
          if (value && typeof value === 'object' && 'increment' in (value as Row)) {
            target[key] = (target[key] ?? 0) + (value as Row).increment;
          } else {
            target[key] = value;
          }
        }
        return { count: 1 };
      },
      aggregate: async () => ({ _sum: { points: 0 } }),
    },
    user: {
      findUnique: async ({ where }: any) => users.find((u) => u.id === where.id) ?? null,
      updateMany: async () => ({ count: 1 }),
    },
    rewardPoint: {
      create: async ({ data }: any) => {
        rewardPoints.push(data);
        return data;
      },
      aggregate: async () => ({ _sum: { points: 0 } }),
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
}

function createService(prismaStub: any): ReferralService {
  const service = new ReferralService(
    prismaStub,
    { notifyUser: async () => undefined } as any,
    { checkAndAwardBadges: async () => [] } as any,
    { record: async () => undefined } as any,
  );
  return service;
}

const DAY = 24 * 60 * 60 * 1000;
const oldDate = new Date(Date.now() - 30 * DAY);
const recentDate = new Date();

describe('ReferralService staged rewards', () => {
  it('awards zero points at signup', async () => {
    const prisma = createPrismaStub({
      users: [
        { id: 'referrer', createdAt: oldDate, deviceFingerprint: 'fp_a' },
        { id: 'referee', createdAt: recentDate, deviceFingerprint: 'fp_b' },
      ],
      referralCodes: [{ id: 'c1', code: 'VERI-ABC123', userId: 'referrer' }],
    });
    const service = createService(prisma);

    const result = await service.processReferral('VERI-ABC123', 'referee');

    expect(result.accepted).toBe(true);
    expect(prisma.rewardPoints.length).toBe(0);
    expect(prisma.referrals[0].points).toBe(0);
    expect(prisma.referrals[0].walletCreated).toBe(false);
  });

  it('pays the referrer and referee at the wallet-created milestone', async () => {
    const prisma = createPrismaStub({
      referrals: [
        { id: 'r1', referrerId: 'referrer', refereeId: 'referee', points: 0, walletCreated: false },
      ],
    });
    const service = createService(prisma);

    const awarded = await service.markWalletCreated('referee');

    expect(awarded).toBe(true);
    expect(prisma.referrals[0].points).toBe(REFERRAL_REWARDS.WALLET_CREATED);
    expect(prisma.rewardPoints).toEqual([
      { userId: 'referrer', points: REFERRAL_REWARDS.WALLET_CREATED, reason: 'REFERRAL_WALLET_CREATED' },
      { userId: 'referee', points: REFERRAL_REWARDS.REFEREE_WELCOME, reason: 'REFERRAL_SIGNUP_BONUS' },
    ]);
  });

  it('is idempotent — a repeated milestone does not double-pay', async () => {
    const prisma = createPrismaStub({
      referrals: [
        { id: 'r1', referrerId: 'referrer', refereeId: 'referee', points: 0, walletCreated: false },
      ],
    });
    const service = createService(prisma);

    await service.markWalletCreated('referee');
    const second = await service.markWalletCreated('referee');

    expect(second).toBe(false);
    expect(prisma.referrals[0].points).toBe(REFERRAL_REWARDS.WALLET_CREATED);
    expect(prisma.rewardPoints.length).toBe(2);
  });

  it('ignores a first send below the qualifying threshold', async () => {
    const prisma = createPrismaStub({
      referrals: [
        {
          id: 'r1',
          referrerId: 'referrer',
          refereeId: 'referee',
          points: 0,
          walletCreated: true,
          firstSendCompleted: false,
        },
      ],
    });
    const service = createService(prisma);

    const awarded = await service.markFirstSend('referee', MIN_QUALIFYING_SEND_USD - 0.01);

    expect(awarded).toBe(false);
    expect(prisma.rewardPoints.length).toBe(0);
  });

  it('awards the first-send milestone at or above the threshold', async () => {
    const prisma = createPrismaStub({
      referrals: [
        {
          id: 'r1',
          referrerId: 'referrer',
          refereeId: 'referee',
          points: REFERRAL_REWARDS.WALLET_CREATED,
          walletCreated: true,
          firstSendCompleted: false,
        },
      ],
    });
    const service = createService(prisma);

    const awarded = await service.markFirstSend('referee', MIN_QUALIFYING_SEND_USD);

    expect(awarded).toBe(true);
    expect(prisma.referrals[0].firstSendCompleted).toBe(true);
    expect(prisma.rewardPoints).toContainEqual({
      userId: 'referrer',
      points: REFERRAL_REWARDS.FIRST_SEND,
      reason: 'REFERRAL_FIRST_SEND',
    });
  });

  it('totals 100 referrer points across all four stages', async () => {
    const prisma = createPrismaStub({
      referrals: [
        {
          id: 'r1',
          referrerId: 'referrer',
          refereeId: 'referee',
          points: 0,
          walletCreated: false,
          firstSendCompleted: false,
          depositRetainedD7: false,
        },
      ],
    });
    const service = createService(prisma);

    await service.markWalletCreated('referee');
    await service.markFirstSend('referee', 25);
    await service.markDepositRetainedD7('referee');

    expect(prisma.referrals[0].points).toBe(
      REFERRAL_REWARDS.WALLET_CREATED +
        REFERRAL_REWARDS.FIRST_SEND +
        REFERRAL_REWARDS.DEPOSIT_RETAINED_D7,
    );
    expect(prisma.referrals[0].points).toBe(100);
  });
});

describe('ReferralService anti-Sybil guardrails', () => {
  const codeRow = { id: 'c1', code: 'VERI-ABC123', userId: 'referrer' };

  it('rejects self-referral', async () => {
    const prisma = createPrismaStub({ referralCodes: [codeRow] });
    const service = createService(prisma);

    const result = await service.processReferral('VERI-ABC123', 'referrer');

    expect(result).toEqual({ accepted: false, reason: 'self_referral' });
  });

  it('rejects an unknown code', async () => {
    const service = createService(createPrismaStub({}));
    const result = await service.processReferral('VERI-NOPE', 'referee');
    expect(result).toEqual({ accepted: false, reason: 'unknown_code' });
  });

  it('rejects a referee sharing the referrer device fingerprint', async () => {
    const prisma = createPrismaStub({
      users: [
        { id: 'referrer', createdAt: oldDate, deviceFingerprint: 'fp_same' },
        { id: 'referee', createdAt: recentDate, deviceFingerprint: 'fp_same' },
      ],
      referralCodes: [codeRow],
    });
    const service = createService(prisma);

    const result = await service.processReferral('VERI-ABC123', 'referee');

    expect(result).toEqual({ accepted: false, reason: 'duplicate_device' });
    expect(prisma.referrals.length).toBe(0);
  });

  it('rejects a referrer account minted moments before the referee', async () => {
    const prisma = createPrismaStub({
      users: [
        { id: 'referrer', createdAt: new Date(Date.now() - 60_000), deviceFingerprint: 'fp_a' },
        { id: 'referee', createdAt: recentDate, deviceFingerprint: 'fp_b' },
      ],
      referralCodes: [codeRow],
    });
    const service = createService(prisma);

    const result = await service.processReferral('VERI-ABC123', 'referee');

    expect(result).toEqual({ accepted: false, reason: 'account_age_gap' });
  });

  it('enforces the daily referral velocity limit', async () => {
    const existing = Array.from({ length: REFERRAL_LIMITS.MAX_PER_DAY }, (_, i) => ({
      id: `r${i}`,
      referrerId: 'referrer',
      refereeId: `prior_${i}`,
      createdAt: new Date(),
    }));
    const prisma = createPrismaStub({
      users: [
        { id: 'referrer', createdAt: oldDate, deviceFingerprint: 'fp_a' },
        { id: 'referee', createdAt: recentDate, deviceFingerprint: 'fp_b' },
      ],
      referralCodes: [codeRow],
      referrals: existing,
    });
    const service = createService(prisma);

    const result = await service.processReferral('VERI-ABC123', 'referee');

    expect(result).toEqual({ accepted: false, reason: 'velocity_limit' });
  });

  it('rejects a referee who was already referred', async () => {
    const prisma = createPrismaStub({
      users: [
        { id: 'referrer', createdAt: oldDate, deviceFingerprint: 'fp_a' },
        { id: 'referee', createdAt: recentDate, deviceFingerprint: 'fp_b' },
      ],
      referralCodes: [codeRow],
      referrals: [{ id: 'r0', referrerId: 'someone_else', refereeId: 'referee' }],
    });
    const service = createService(prisma);

    const result = await service.processReferral('VERI-ABC123', 'referee');

    expect(result).toEqual({ accepted: false, reason: 'already_referred' });
  });
});
