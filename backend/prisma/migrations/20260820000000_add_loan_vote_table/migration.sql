-- LoanVote was added to schema.prisma alongside pool voting but no migration
-- was ever generated for it. Any environment provisioned from migrations alone
-- (CI, staging, a new production replica) was missing this table, causing
-- prisma.loanVote.create() to throw P2021 at runtime.

-- CreateTable
CREATE TABLE IF NOT EXISTS "LoanVote" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "approve" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "LoanVote_loanId_voterId_key" ON "LoanVote"("loanId", "voterId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LoanVote_loanId_idx" ON "LoanVote"("loanId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LoanVote_voterId_idx" ON "LoanVote"("voterId");

-- AddForeignKey (idempotent: skip if already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LoanVote_loanId_fkey'
  ) THEN
    ALTER TABLE "LoanVote"
      ADD CONSTRAINT "LoanVote_loanId_fkey"
      FOREIGN KEY ("loanId") REFERENCES "LoanApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LoanVote_voterId_fkey'
  ) THEN
    ALTER TABLE "LoanVote"
      ADD CONSTRAINT "LoanVote_voterId_fkey"
      FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
