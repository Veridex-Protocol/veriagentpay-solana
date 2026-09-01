-- Creates "PasskeyCredential".
--
-- Backfill of a missing migration. The table was originally introduced with
-- `prisma db push`, so no migration ever created it, while three later
-- migrations alter it:
--
--   20260731141900_add_lookup_hash_to_passkey    (envelope-encryption columns)
--   20260731144200_make_passkey_fields_nullable  (drops NOT NULL on plaintext)
--   20260804180000_production_webauthn           (WebAuthn metadata columns)
--
-- The chain was therefore unrunnable from an empty database: `migrate deploy`
-- failed at 20260731141900 with 42P01 "relation PasskeyCredential does not
-- exist". Any fresh environment — CI, a new machine, a rebuilt staging — hit
-- this. Existing databases never did, because the table was already there.
--
-- This runs immediately before 20260731141900 and reconstructs the table as it
-- stood at that point: the current schema minus every column the three later
-- migrations add, with `credentialId`, `publicKeyX` and `publicKeyY` still
-- NOT NULL since 20260731144200 is what relaxes them.
--
-- Every statement is idempotent. On a database where the table already exists,
-- this is a no-op, so it is safe to apply to environments provisioned before
-- the gap was noticed.

CREATE TABLE IF NOT EXISTS "PasskeyCredential" (
    "id"           TEXT         NOT NULL,
    "userId"       TEXT         NOT NULL,
    "credentialId" TEXT         NOT NULL,
    "publicKeyX"   TEXT         NOT NULL,
    "publicKeyY"   TEXT         NOT NULL,
    "counter"      INTEGER      NOT NULL DEFAULT 0,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasskeyCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PasskeyCredential_credentialId_key"
    ON "PasskeyCredential"("credentialId");

CREATE INDEX IF NOT EXISTS "PasskeyCredential_userId_idx"
    ON "PasskeyCredential"("userId");

-- Added separately so the whole migration stays idempotent: ADD CONSTRAINT has
-- no IF NOT EXISTS, and CREATE TABLE IF NOT EXISTS would skip an inline
-- constraint on a database where the table already exists but the foreign key
-- somehow does not.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'PasskeyCredential_userId_fkey'
    ) THEN
        ALTER TABLE "PasskeyCredential"
            ADD CONSTRAINT "PasskeyCredential_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
