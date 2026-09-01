-- Replaces GrowthService's in-memory Maps with durable tables.
-- Previously public envelopes, managed vaults, streak history and airdrop
-- claims were lost on every server restart.

CREATE TABLE "PublicEnvelope" (
  "id" TEXT NOT NULL,
  "creatorId" TEXT NOT NULL,
  "token" TEXT NOT NULL DEFAULT 'USDC',
  "totalAmount" DOUBLE PRECISION NOT NULL,
  "remainingBalance" DOUBLE PRECISION NOT NULL,
  "maxClaims" INTEGER NOT NULL,
  "remainingClaims" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PublicEnvelope_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PublicEnvelope_status_createdAt_idx" ON "PublicEnvelope"("status", "createdAt");
CREATE INDEX "PublicEnvelope_creatorId_idx" ON "PublicEnvelope"("creatorId");

CREATE TABLE "PublicEnvelopeClaim" (
  "id" TEXT NOT NULL,
  "envelopeId" TEXT NOT NULL,
  "claimerAddress" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "txHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PublicEnvelopeClaim_pkey" PRIMARY KEY ("id")
);

-- One claim per wallet per envelope: this constraint is the double-claim guard.
CREATE UNIQUE INDEX "PublicEnvelopeClaim_envelopeId_claimerAddress_key"
  ON "PublicEnvelopeClaim"("envelopeId", "claimerAddress");
CREATE INDEX "PublicEnvelopeClaim_claimerAddress_idx" ON "PublicEnvelopeClaim"("claimerAddress");

ALTER TABLE "PublicEnvelopeClaim"
  ADD CONSTRAINT "PublicEnvelopeClaim_envelopeId_fkey"
  FOREIGN KEY ("envelopeId") REFERENCES "PublicEnvelope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ManagedVault" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "managerAddress" TEXT NOT NULL,
  "token" TEXT NOT NULL DEFAULT 'USDC',
  "apy" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "performanceFeeBps" INTEGER NOT NULL DEFAULT 2000,
  "totalDeposits" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManagedVault_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ManagedVault_apy_idx" ON "ManagedVault"("apy");
CREATE INDEX "ManagedVault_managerAddress_idx" ON "ManagedVault"("managerAddress");

CREATE TABLE "AirdropClaim" (
  "id" TEXT NOT NULL,
  "wallet" TEXT NOT NULL,
  "rewardAmount" DOUBLE PRECISION NOT NULL,
  "vestingDays" INTEGER NOT NULL DEFAULT 30,
  "unlockDate" TIMESTAMP(3) NOT NULL,
  "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AirdropClaim_pkey" PRIMARY KEY ("id")
);

-- Enforces exactly one airdrop claim per wallet.
CREATE UNIQUE INDEX "AirdropClaim_wallet_key" ON "AirdropClaim"("wallet");
CREATE INDEX "AirdropClaim_unlockDate_idx" ON "AirdropClaim"("unlockDate");
