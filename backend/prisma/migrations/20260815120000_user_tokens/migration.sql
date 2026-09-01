-- Tokens a user has asked us to watch, by contract address.
--
-- The deposit listener already sees Transfer events for every token arriving at
-- a user's vault — it filters on the recipient, not the token — and drops the
-- ones it cannot identify because it has no decimals for them. A row here
-- supplies the metadata and the user's consent to credit it.
--
-- Address is stored lowercased so lookups need no checksum pass; `chainId` is
-- carried per row so the same table serves additional chains unchanged.
CREATE TABLE "UserToken" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "address"   TEXT NOT NULL,
    "chainId"   INTEGER NOT NULL,
    "symbol"    TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "decimals"  INTEGER NOT NULL,
    -- Refreshed daily from chain. Deposits predating the add are never
    -- backfilled as ledger rows; the balance is read instead, which is
    -- authoritative regardless of what history we hold. Text, so an
    -- unknown-scale token stays lossless.
    "lastBalanceRaw"  TEXT,
    "balanceSyncedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserToken_pkey" PRIMARY KEY ("id")
);

-- One row per user per token per chain. Removal is a soft delete, so the
-- uniqueness holds across re-adds rather than accumulating duplicates.
CREATE UNIQUE INDEX "UserToken_userId_chainId_address_key"
    ON "UserToken"("userId", "chainId", "address");

-- The deposit listener resolves an incoming Transfer by (chain, contract)
-- before it knows which user it belongs to.
CREATE INDEX "UserToken_chainId_address_idx" ON "UserToken"("chainId", "address");
CREATE INDEX "UserToken_userId_idx" ON "UserToken"("userId");

ALTER TABLE "UserToken"
    ADD CONSTRAINT "UserToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
