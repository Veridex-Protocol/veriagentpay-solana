-- Session keys are provisioned in the database before their on-chain grant
-- exists. Without a flag for that, the backend hands out keys that
-- `executeWithLocalSession` rejects, and the failure surfaces as an opaque
-- on-chain revert rather than "your session is not active yet".
ALTER TABLE "SessionKey" ADD COLUMN "activatedAt" TIMESTAMP(3);

-- Existing keys predate the passkey-authorized grant flow and were registered
-- by the relayer, so their grants are already on-chain. Treat them as active to
-- avoid invalidating live sessions on deploy.
UPDATE "SessionKey" SET "activatedAt" = "createdAt" WHERE "revokedAt" IS NULL;
