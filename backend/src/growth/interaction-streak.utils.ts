import { UserActivityAction } from '@prisma/client';

export interface InteractionStreakState {
  currentStreak: number;
  longestStreak: number;
  lastActiveAt: Date;
  lastGracePassUsedAt?: Date | null;
}

export interface InteractionStreakUpdate {
  currentStreak: number;
  longestStreak: number;
  lastActiveAt: Date;
  lastGracePassUsedAt?: Date;
  gracePassUsed: boolean;
}

/** Difference in UTC calendar days; calendar boundaries, not elapsed hours, define a streak. */
export function calendarDayDifference(from: Date, to: Date): number {
  const fromDay = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const toDay = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((toDay - fromDay) / (24 * 60 * 60 * 1000));
}

function usedGracePassThisMonth(lastUsedAt: Date | null | undefined, now: Date): boolean {
  return Boolean(
    lastUsedAt &&
      lastUsedAt.getUTCFullYear() === now.getUTCFullYear() &&
      lastUsedAt.getUTCMonth() === now.getUTCMonth(),
  );
}

/**
 * User-initiated interactions that qualify toward the daily activity streak.
 * Passive / system events (TRANSFER_RECEIVED, DEPOSIT_RECEIVED, etc.) are
 * intentionally excluded so the streak reflects genuine engagement.
 */
export const QUALIFYING_STREAK_ACTIONS = new Set([
  // Payments
  'TRANSFER_SENT',
  'REQUEST_CREATED',
  'REQUEST_PAID',
  'SPLIT_CREATED',
  'SPLIT_PAID',
  // Social / Growth
  'ENVELOPE_CREATED',
  'ENVELOPE_CLAIMED',
  'REFERRAL_REGISTERED',
  // Bot / app interaction (synthetic, recorded by the interceptor / platform service)
  'BOT_COMMAND',
  'APP_LOGIN',
]);

/** Qualifying actions that are persisted in UserActivityLog and can be queried as Prisma enums. */
export const QUALIFYING_STREAK_ACTIVITY_ACTIONS: readonly UserActivityAction[] = [
  UserActivityAction.TRANSFER_SENT,
  UserActivityAction.REQUEST_CREATED,
  UserActivityAction.REQUEST_PAID,
  UserActivityAction.SPLIT_CREATED,
  UserActivityAction.SPLIT_PAID,
  UserActivityAction.ENVELOPE_CREATED,
  UserActivityAction.ENVELOPE_CLAIMED,
  UserActivityAction.REFERRAL_REGISTERED,
];

/**
 * Calculates the next streak state for an eligible interaction.
 * A return after exactly one missed calendar day consumes the monthly pass;
 * longer gaps reset. A same-day interaction is a no-op.
 */
export function calculateInteractionStreakUpdate(
  streak: InteractionStreakState,
  now: Date,
): InteractionStreakUpdate | null {
  const daysSinceLast = calendarDayDifference(streak.lastActiveAt, now);
  if (daysSinceLast <= 0) return null;

  const gracePassUsed =
    daysSinceLast === 2 && !usedGracePassThisMonth(streak.lastGracePassUsedAt, now);
  const currentStreak = daysSinceLast === 1 || gracePassUsed ? streak.currentStreak + 1 : 1;

  return {
    currentStreak,
    longestStreak: Math.max(currentStreak, streak.longestStreak),
    lastActiveAt: now,
    ...(gracePassUsed ? { lastGracePassUsedAt: now } : {}),
    gracePassUsed,
  };
}
