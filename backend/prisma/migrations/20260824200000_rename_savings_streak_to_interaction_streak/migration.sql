-- Broaden SavingsStreak (deposit-only) into InteractionStreak (any qualifying
-- user action). This is a data-preserving rename; existing streak rows carry
-- over unchanged.

ALTER TABLE "SavingsStreak" RENAME TO "InteractionStreak";
ALTER TABLE "InteractionStreak" RENAME COLUMN "lastDepositAt" TO "lastActiveAt";
ALTER TABLE "InteractionStreak" ADD COLUMN "lastInteractionType" TEXT;

-- Rename indexes
ALTER INDEX "SavingsStreak_pkey" RENAME TO "InteractionStreak_pkey";
ALTER INDEX "SavingsStreak_userId_key" RENAME TO "InteractionStreak_userId_key";

-- Rename foreign key constraint
ALTER TABLE "InteractionStreak" RENAME CONSTRAINT "SavingsStreak_userId_fkey" TO "InteractionStreak_userId_fkey";
