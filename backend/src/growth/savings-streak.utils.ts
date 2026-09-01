export interface SavingsStreakState {
  currentStreak: number;
  longestStreak: number;
  lastDepositAt: Date;
  lastGracePassUsedAt?: Date | null;
}

export interface SavingsStreakUpdate {
  currentStreak: number;
  longestStreak: number;
  lastDepositAt: Date;
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
 * Calculates the next streak state for an eligible savings action.
 * A return after exactly one missed calendar day consumes the monthly pass;
 * longer gaps reset. A same-day save is a no-op.
 */
export function calculateSavingsStreakUpdate(
  streak: SavingsStreakState,
  now: Date,
): SavingsStreakUpdate | null {
  const daysSinceLast = calendarDayDifference(streak.lastDepositAt, now);
  if (daysSinceLast <= 0) return null;

  const gracePassUsed =
    daysSinceLast === 2 && !usedGracePassThisMonth(streak.lastGracePassUsedAt, now);
  const currentStreak = daysSinceLast === 1 || gracePassUsed ? streak.currentStreak + 1 : 1;

  return {
    currentStreak,
    longestStreak: Math.max(currentStreak, streak.longestStreak),
    lastDepositAt: now,
    ...(gracePassUsed ? { lastGracePassUsedAt: now } : {}),
    gracePassUsed,
  };
}
