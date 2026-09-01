-- Make plaintext credential fields nullable (they're deprecated when encryption is enabled)
ALTER TABLE "PasskeyCredential" ALTER COLUMN "credentialId" DROP NOT NULL;
ALTER TABLE "PasskeyCredential" ALTER COLUMN "publicKeyX" DROP NOT NULL;
ALTER TABLE "PasskeyCredential" ALTER COLUMN "publicKeyY" DROP NOT NULL;
