ALTER TABLE "PasskeyCredential"
  ADD COLUMN "credentialPublicKey" BYTEA,
  ADD COLUMN "transports" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "deviceType" TEXT,
  ADD COLUMN "backedUp" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "backupStateKnown" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "label" TEXT,
  ADD COLUMN "lastUsedAt" TIMESTAMP(3),
  ADD COLUMN "revokedAt" TIMESTAMP(3);

CREATE TABLE "WebAuthnChallenge" (
  "id" TEXT NOT NULL,
  "challenge" TEXT NOT NULL,
  "flow" TEXT NOT NULL,
  "userId" TEXT,
  "context" JSONB,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebAuthnChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebAuthnChallenge_challenge_key" ON "WebAuthnChallenge"("challenge");
CREATE INDEX "WebAuthnChallenge_expiresAt_idx" ON "WebAuthnChallenge"("expiresAt");
CREATE INDEX "WebAuthnChallenge_userId_flow_idx" ON "WebAuthnChallenge"("userId", "flow");

ALTER TABLE "SessionKey" ADD COLUMN "expiryNoticeSentAt" TIMESTAMP(3);
CREATE INDEX "SessionKey_expiryAt_expiryNoticeSentAt_idx" ON "SessionKey"("expiryAt", "expiryNoticeSentAt");
