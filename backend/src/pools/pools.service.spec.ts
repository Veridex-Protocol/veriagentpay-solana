/**
 * Covers the pool rules whose failure costs money rather than correctness.
 *
 * These are guards, not features: each one exists because the unguarded version
 * either moved funds twice or moved them somewhere nobody could reach. They are
 * exercised against a stub Prisma so the assertions are about the rule, not
 * about the database.
 */

import { describe, expect, it, mock } from 'bun:test';

mock.module('@veridex/sdk', () => ({ PasskeyManager: class {}, SessionKeyManager: class {} }));

const { PoolsService } = await import('./pools.service');
const { LoanStatus } = await import('@prisma/client');

/** A pool row as `findOne` would return it, overridable per test. */
function poolRow(overrides: Record<string, any> = {}) {
  return {
    id: 'pool-1',
    name: 'Dubai',
    token: 'USDT',
    poolBalance: 440,
    creatorId: 'creator-1',
    onChainPoolId: 7,
    members: [],
    loans: [],
    ...overrides,
  };
}

function makeService(prismaOverrides: Record<string, any> = {}) {
  const prisma: any = {
    groupPool: { findUnique: async () => poolRow() },
    userActivityLog: { findMany: async () => [] },
    loanApplication: { findFirst: async () => null },
    user: { findUnique: async () => null },
    ...prismaOverrides,
  };

  const noop: any = { record: async () => {}, notifyUser: async () => {}, create: async () => {} };
  return new PoolsService(prisma, noop, noop, noop, noop, undefined as any);
}

describe('deposit — pools without on-chain custody', () => {
  /**
   * The bug this prevents: deposits used to be a bare ERC-20 transfer to the
   * pool contract, which credits no `memberShares`, so `withdraw` could never
   * return them. Funds sent to a pool with no on-chain id are unrecoverable by
   * anyone, so the deposit must be refused rather than accepted and lost.
   */
  it('refuses a deposit into a pool that has no on-chain id', async () => {
    const service = makeService({
      groupPool: { findUnique: async () => poolRow({ onChainPoolId: null }) },
      user: {
        findUnique: async () => ({
          id: 'user-1',
          smartWallet: { address: '0x' + '11'.repeat(20) },
          sessionKeys: [{ id: 'sk-1' }],
        }),
      },
    });

    await expect(service.deposit('pool-1', 'user-1', 50)).rejects.toThrow(/could not be withdrawn/);
  });

  it('rejects a non-positive amount before touching anything', async () => {
    await expect(makeService().deposit('pool-1', 'user-1', 0)).rejects.toThrow(/must be > 0/);
  });
});

describe('requestLoan — one outstanding loan per member', () => {
  const borrower = {
    findUnique: async () => ({ id: 'user-1', username: 'alice', email: null }),
  };

  it('refuses a second request while one is still awaiting votes', async () => {
    const service = makeService({
      user: borrower,
      loanApplication: {
        findFirst: async () => ({ amount: 50, status: LoanStatus.PENDING }),
      },
    });

    await expect(
      service.requestLoan('pool-1', 'user-1', { amount: 10, durationDays: 14 }),
    ).rejects.toThrow(/awaiting votes/);
  });

  it('refuses a request while an earlier loan is still owed', async () => {
    const service = makeService({
      user: borrower,
      loanApplication: {
        findFirst: async () => ({ amount: 10, status: LoanStatus.EXECUTED }),
      },
    });

    await expect(
      service.requestLoan('pool-1', 'user-1', { amount: 10, durationDays: 14 }),
    ).rejects.toThrow(/still owe/);
  });

  it('refuses to lend more than the pool holds', async () => {
    await expect(
      makeService({ user: borrower }).requestLoan('pool-1', 'user-1', {
        amount: 10_000,
        durationDays: 14,
      }),
    ).rejects.toThrow(/exceeds current pool balance/);
  });

  /**
   * The exemption that makes the rule survivable: an extension is a request to
   * move a deadline, not new debt. Blocking it would leave a borrower who needs
   * more time with no way to ask, so the outstanding-loan query excludes
   * `isExtension` rows — asserted here as the filter actually sent to Prisma.
   */
  it('excludes extension rows when looking for outstanding debt', async () => {
    let seen: any = null;
    const service = makeService({
      user: borrower,
      loanApplication: {
        findFirst: async (args: any) => {
          seen = args;
          return null;
        },
        create: async () => ({ id: 'loan-1', status: 'PENDING' }),
      },
    });

    await service
      .requestLoan('pool-1', 'user-1', { amount: 10, durationDays: 14 })
      .catch(() => undefined); // Later stages need more of the graph than this stub has.

    expect(seen?.where?.isExtension).toBe(false);
    expect(seen?.where?.status?.in).toContain(LoanStatus.DEFAULTED);
  });
});

describe('withdraw — pools with no on-chain custody', () => {
  /**
   * `withdraw` is the only way funds leave a pool. It used to decrement two
   * database columns and move nothing, so a member who withdrew simply lost
   * their claim. For a pool that was never registered on-chain there is
   * genuinely nothing to withdraw, and saying so beats silently zeroing a row.
   */
  it('refuses to withdraw from a pool that has no on-chain id', async () => {
    const service = makeService({
      groupPool: { findUnique: async () => poolRow({ onChainPoolId: null }) },
    });

    await expect(service.withdraw('pool-1', 'user-1', 50)).rejects.toThrow(/cannot be withdrawn/);
  });

  it('refuses to withdraw more than the pool holds', async () => {
    await expect(makeService().withdraw('pool-1', 'user-1', 10_000)).rejects.toThrow(
      /exceeds available pool balance/,
    );
  });
});

describe('repayLoan — authorization and settlement state', () => {
  const executedLoan = {
    id: 'loan-1',
    borrowerId: 'user-1',
    amount: 10,
    durationDays: 14,
    status: LoanStatus.EXECUTED,
    onChainLoanId: 3,
  };

  it('refuses a repayment from anyone but the borrower', async () => {
    const service = makeService({
      groupPool: { findUnique: async () => poolRow({ loans: [executedLoan] }) },
    });

    await expect(service.repayLoan('pool-1', 'loan-1', 'someone-else', 10)).rejects.toThrow(
      /Only the borrower/,
    );
  });

  /**
   * The guard against paying twice. Repayment used to have no status check at
   * all: it transferred, then wrote REPAID, so a double-tapped button took the
   * amount out of the borrower's vault a second time for a settled debt.
   */
  it('refuses to repay a loan that is already settled', async () => {
    const service = makeService({
      groupPool: {
        findUnique: async () =>
          poolRow({ loans: [{ ...executedLoan, status: LoanStatus.REPAID }] }),
      },
      loanApplication: {
        updateMany: async () => ({ count: 0 }),
        findUnique: async () => ({ status: LoanStatus.REPAID }),
      },
    });

    await expect(service.repayLoan('pool-1', 'loan-1', 'user-1', 10)).rejects.toThrow(
      /already been repaid/,
    );
  });
});

describe('interest', () => {
  const { PoolsService: Svc } = { PoolsService } as any;

  /**
   * The contract charges no interest — `repayLoan` demands principal plus any
   * late fee. Interest is added to what is repaid, and the contract credits
   * everything above the late fee to `poolBalance`, so it reaches lenders
   * through the share price.
   */
  it('accrues on days actually held, so repaying early costs less', () => {
    const disbursedAt = new Date('2026-01-01T00:00:00Z');
    const base = { principal: 1000, interestRateBps: 1200, durationDays: 30, disbursedAt };

    const afterOneDay = Svc.accruedInterest({ ...base, now: new Date('2026-01-02T00:00:00Z') });
    const afterTenDays = Svc.accruedInterest({ ...base, now: new Date('2026-01-11T00:00:00Z') });

    // 1000 at 12% p.a. is 0.33/day.
    expect(afterOneDay).toBeCloseTo(0.33, 2);
    expect(afterTenDays).toBeCloseTo(3.29, 2);
    expect(afterTenDays).toBeGreaterThan(afterOneDay);
  });

  /**
   * Lateness is priced by the contract's late fee. Letting interest run past
   * the agreed term would charge for the same thing twice, under a name that
   * says otherwise.
   */
  it('stops accruing at the agreed term', () => {
    const disbursedAt = new Date('2026-01-01T00:00:00Z');
    const base = { principal: 1000, interestRateBps: 1200, durationDays: 30, disbursedAt };

    const atTerm = Svc.accruedInterest({ ...base, now: new Date('2026-01-31T00:00:00Z') });
    const wellPast = Svc.accruedInterest({ ...base, now: new Date('2026-06-01T00:00:00Z') });

    expect(wellPast).toBe(atTerm);
  });

  it('charges nothing when the pool set no rate', () => {
    expect(
      Svc.accruedInterest({ principal: 1000, interestRateBps: 0, durationDays: 30 }),
    ).toBe(0);
  });

  it('never returns a negative amount for a future disbursement', () => {
    expect(
      Svc.accruedInterest({
        principal: 1000,
        interestRateBps: 1200,
        durationDays: 30,
        disbursedAt: new Date('2026-06-01T00:00:00Z'),
        now: new Date('2026-01-01T00:00:00Z'),
      }),
    ).toBe(0);
  });
});
