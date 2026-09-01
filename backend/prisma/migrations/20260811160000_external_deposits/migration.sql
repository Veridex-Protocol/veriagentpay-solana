-- External wallet deposits: detect inbound ERC-20 transfers from any wallet
-- (MetaMask, Trust, Coinbase Wallet) into a user's smart account.

ALTER TYPE "UserActivityAction" ADD VALUE IF NOT EXISTS 'DEPOSIT_RECEIVED';

CREATE TYPE "DepositStatus" AS ENUM ('PENDING', 'CONFIRMED', 'ORPHANED');

CREATE TABLE "Deposit" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "toAddress" TEXT NOT NULL,
  "fromAddress" TEXT NOT NULL,
  "tokenAddress" TEXT NOT NULL,
  "tokenSymbol" TEXT,
  "amountRaw" TEXT NOT NULL,
  "amount" DECIMAL(65,30),
  "decimals" INTEGER,
  "txHash" TEXT NOT NULL,
  "logIndex" INTEGER NOT NULL,
  "blockNumber" BIGINT NOT NULL,
  "blockHash" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "status" "DepositStatus" NOT NULL DEFAULT 'CONFIRMED',
  "recognized" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- Idempotency: a log is uniquely identified by (transaction, position in it).
-- This is what makes re-scanning a block range safe.
CREATE UNIQUE INDEX "Deposit_txHash_logIndex_key" ON "Deposit"("txHash", "logIndex");
CREATE INDEX "Deposit_userId_occurredAt_idx" ON "Deposit"("userId", "occurredAt");
CREATE INDEX "Deposit_toAddress_idx" ON "Deposit"("toAddress");
CREATE INDEX "Deposit_blockNumber_idx" ON "Deposit"("blockNumber");
CREATE INDEX "Deposit_status_idx" ON "Deposit"("status");

ALTER TABLE "Deposit"
  ADD CONSTRAINT "Deposit_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Resumable indexer cursor. Without it a restart re-scans from genesis or
-- silently skips whatever blocks were produced while the service was down.
CREATE TABLE "IndexerCursor" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "chainId" INTEGER NOT NULL,
  "lastBlock" BIGINT NOT NULL,
  "lastBlockHash" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IndexerCursor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IndexerCursor_name_chainId_key" ON "IndexerCursor"("name", "chainId");
