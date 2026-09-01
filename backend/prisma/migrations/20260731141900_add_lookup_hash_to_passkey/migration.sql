-- Add credential vault encryption columns
ALTER TABLE "PasskeyCredential" ADD COLUMN IF NOT EXISTS "lookupHash" TEXT;
ALTER TABLE "PasskeyCredential" ADD COLUMN IF NOT EXISTS "encryptedPayload" TEXT;
ALTER TABLE "PasskeyCredential" ADD COLUMN IF NOT EXISTS "wrappedDek" TEXT;
ALTER TABLE "PasskeyCredential" ADD COLUMN IF NOT EXISTS "kekVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PasskeyCredential" ADD COLUMN IF NOT EXISTS "iv" TEXT;
ALTER TABLE "PasskeyCredential" ADD COLUMN IF NOT EXISTS "authTag" TEXT;

-- Create indices on lookupHash
CREATE UNIQUE INDEX IF NOT EXISTS "PasskeyCredential_lookupHash_key" ON "PasskeyCredential"("lookupHash");
CREATE INDEX IF NOT EXISTS "PasskeyCredential_lookupHash_idx" ON "PasskeyCredential"("lookupHash");
