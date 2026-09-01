import { describe, expect, it } from 'bun:test';
import { calculateSavingsStreakUpdate } from './savings-streak.utils';

const state = (overrides: Record<string, any> = {}) => ({
  currentStreak: 6,
  longestStreak: 9,
  lastDepositAt: new Date('2026-08-10T09:00:00.000Z'),
  lastGracePassUsedAt: null,
  ...overrides,
});

describe('calculateSavingsStreakUpdate', () => {
  it('does not advance a streak twice on the same calendar day', () => {
    expect(calculateSavingsStreakUpdate(state(), new Date('2026-08-10T23:59:00.000Z'))).toBeNull();
  });

  it('uses the monthly grace pass for exactly one missed calendar day', () => {
    const now = new Date('2026-08-12T09:00:00.000Z');
    expect(calculateSavingsStreakUpdate(state(), now)).toEqual({
      currentStreak: 7,
      longestStreak: 9,
      lastDepositAt: now,
      lastGracePassUsedAt: now,
      gracePassUsed: true,
    });
  });

  it('resets after a second missed day when the monthly pass is spent', () => {
    const result = calculateSavingsStreakUpdate(
      state({ lastGracePassUsedAt: new Date('2026-08-01T09:00:00.000Z') }),
      new Date('2026-08-12T09:00:00.000Z'),
    );
    expect(result).toMatchObject({ currentStreak: 1, longestStreak: 9, gracePassUsed: false });
  });

  it('restores availability at the beginning of a new calendar month', () => {
    const now = new Date('2026-09-02T09:00:00.000Z');
    const result = calculateSavingsStreakUpdate(
      state({ lastDepositAt: new Date('2026-08-31T09:00:00.000Z'), lastGracePassUsedAt: new Date('2026-08-12T09:00:00.000Z') }),
      now,
    );
    expect(result).toMatchObject({ currentStreak: 7, gracePassUsed: true, lastGracePassUsedAt: now });
  });
});
