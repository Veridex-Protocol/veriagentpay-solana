-- SEC-038: short-lived access tokens with revocable refresh tokens.
--
-- Access tokens were valid for 24 hours, carried no `jti`, and had no denylist,
-- so a leaked token could not be invalidated short of rotating JWT_SECRET and
-- logging out every user on the platform.
CREATE TABLE "RefreshToken" (
    "id"        TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX "RefreshToken_userId_idx"    ON "RefreshToken"("userId");
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

ALTER TABLE "RefreshToken"
  ADD CONSTRAINT "RefreshToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SEC-039: one airdrop claim per ACCOUNT, not per arbitrary string.
--
-- `claimAudit` previously wrote whatever `wallet` value the caller supplied, on
-- an unauthenticated endpoint. Uniqueness on `wallet` enforced one claim per
-- string, so an attacker minted unlimited claims with fabricated addresses.
--
-- NOTE: this backfill assumes existing `wallet` values correspond to real smart
-- wallets. Rows that do not match a registered wallet are left with a NULL
-- userId and MUST be reconciled manually before any distribution — they are the
-- fabricated claims, if any were made.
ALTER TABLE "AirdropClaim" ADD COLUMN "userId" TEXT;

UPDATE "AirdropClaim" ac
SET "userId" = sw."userId"
FROM "SmartWallet" sw
WHERE LOWER(sw."address") = LOWER(ac."wallet");

-- Fail rather than silently delete financial/distribution records. Operations
-- must reconcile or explicitly revoke unmatched claims before retrying.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "AirdropClaim" WHERE "userId" IS NULL) THEN
    RAISE EXCEPTION 'Unmatched airdrop claims require manual reconciliation before SEC-039 migration';
  END IF;
END $$;

ALTER TABLE "AirdropClaim" ALTER COLUMN "userId" SET NOT NULL;
CREATE UNIQUE INDEX "AirdropClaim_userId_key" ON "AirdropClaim"("userId");
