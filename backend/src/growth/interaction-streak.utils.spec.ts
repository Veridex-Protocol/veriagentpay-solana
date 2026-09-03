import { describe, expect, it } from 'bun:test';
import {
  calculateInteractionStreakUpdate,
  QUALIFYING_STREAK_ACTIONS,
  QUALIFYING_STREAK_ACTIVITY_ACTIONS,
} from './interaction-streak.utils';

const state = (overrides: Record<string, any> = {}) => ({
  currentStreak: 6,
  longestStreak: 9,
  lastActiveAt: new Date('2026-08-10T09:00:00.000Z'),
  lastGracePassUsedAt: null,
  ...overrides,
});

describe('calculateInteractionStreakUpdate', () => {
  it('does not advance a streak twice on the same calendar day', () => {
    expect(calculateInteractionStreakUpdate(state(), new Date('2026-08-10T23:59:00.000Z'))).toBeNull();
  });

  it('uses the monthly grace pass for exactly one missed calendar day', () => {
    const now = new Date('2026-08-12T09:00:00.000Z');
    expect(calculateInteractionStreakUpdate(state(), now)).toEqual({
      currentStreak: 7,
      longestStreak: 9,
      lastActiveAt: now,
      lastGracePassUsedAt: now,
      gracePassUsed: true,
    });
  });

  it('resets after a second missed day when the monthly pass is spent', () => {
    const result = calculateInteractionStreakUpdate(
      state({ lastGracePassUsedAt: new Date('2026-08-01T09:00:00.000Z') }),
      new Date('2026-08-12T09:00:00.000Z'),
    );
    expect(result).toMatchObject({ currentStreak: 1, longestStreak: 9, gracePassUsed: false });
  });

  it('restores availability at the beginning of a new calendar month', () => {
    const now = new Date('2026-09-02T09:00:00.000Z');
    const result = calculateInteractionStreakUpdate(
      state({ lastActiveAt: new Date('2026-08-31T09:00:00.000Z'), lastGracePassUsedAt: new Date('2026-08-12T09:00:00.000Z') }),
      now,
    );
    expect(result).toMatchObject({ currentStreak: 7, gracePassUsed: true, lastGracePassUsedAt: now });
  });
});

describe('qualifying streak actions', () => {
  it('keeps synthetic interactions out of the persisted Prisma activity filter', () => {
    expect(QUALIFYING_STREAK_ACTIONS.has('BOT_COMMAND')).toBe(true);
    expect(QUALIFYING_STREAK_ACTIONS.has('APP_LOGIN')).toBe(true);
    expect(QUALIFYING_STREAK_ACTIVITY_ACTIONS).not.toContain('BOT_COMMAND');
    expect(QUALIFYING_STREAK_ACTIVITY_ACTIONS).not.toContain('APP_LOGIN');
  });
});
