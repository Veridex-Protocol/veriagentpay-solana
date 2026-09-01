-- A grace pass preserves a streak across one missed calendar day, once per
-- calendar month. NULL means the user has not used the current month's pass.
ALTER TABLE "SavingsStreak" ADD COLUMN "lastGracePassUsedAt" TIMESTAMP(3);
