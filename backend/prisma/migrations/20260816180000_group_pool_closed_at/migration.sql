-- Marks a pool the creator has wound down. Terminal: no deposits, no loans.
ALTER TABLE "GroupPool" ADD COLUMN "closedAt" TIMESTAMP(3);
