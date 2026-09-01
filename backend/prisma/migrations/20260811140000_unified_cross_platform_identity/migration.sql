-- Unified cross-platform identity.
--
-- 1. Verification codes become strictly single-use.
-- 2. Backfills SocialNode rows for every account created before SocialNode
--    creation was wired into registerUser. Without this backfill, users who
--    signed up through a bot have no SocialNode at all, which means
--    UnifiedNotificationService delivers them nothing on any platform.

-- ---------------------------------------------------------------------
-- 0. Activity actions for account linking
-- ---------------------------------------------------------------------
ALTER TYPE "UserActivityAction" ADD VALUE IF NOT EXISTS 'ACCOUNT_LINKED';
ALTER TYPE "UserActivityAction" ADD VALUE IF NOT EXISTS 'ACCOUNT_UNLINKED';

-- ---------------------------------------------------------------------
-- 1. Single-use verification codes
-- ---------------------------------------------------------------------
ALTER TABLE "VerificationCode"
  ADD COLUMN "usedAt" TIMESTAMP(3),
  ADD COLUMN "usedBy" TEXT;

CREATE INDEX "VerificationCode_userId_platform_idx" ON "VerificationCode"("userId", "platform");
CREATE INDEX "VerificationCode_expiresAt_idx" ON "VerificationCode"("expiresAt");

-- Any code issued before this migration predates single-use enforcement and
-- must not remain redeemable.
UPDATE "VerificationCode"
SET "usedAt" = NOW()
WHERE "usedAt" IS NULL;

-- ---------------------------------------------------------------------
-- 2. Backfill SocialNode from the denormalized User platform columns
-- ---------------------------------------------------------------------
-- The unique constraint is (platform, platformUserId). ON CONFLICT DO NOTHING
-- keeps any hand-linked node authoritative over the backfill.

INSERT INTO "SocialNode" ("id", "userId", "platform", "platformUserId", "username", "createdAt")
SELECT gen_random_uuid(), u."id", 'telegram', u."telegramId", u."username", u."createdAt"
FROM "User" u
WHERE u."telegramId" IS NOT NULL AND u."telegramId" <> ''
ON CONFLICT ("platform", "platformUserId") DO NOTHING;

INSERT INTO "SocialNode" ("id", "userId", "platform", "platformUserId", "username", "createdAt")
SELECT gen_random_uuid(), u."id", 'whatsapp', u."whatsappId", u."username", u."createdAt"
FROM "User" u
WHERE u."whatsappId" IS NOT NULL AND u."whatsappId" <> ''
ON CONFLICT ("platform", "platformUserId") DO NOTHING;

INSERT INTO "SocialNode" ("id", "userId", "platform", "platformUserId", "username", "createdAt")
SELECT gen_random_uuid(), u."id", 'discord', u."discordId", u."username", u."createdAt"
FROM "User" u
WHERE u."discordId" IS NOT NULL AND u."discordId" <> ''
ON CONFLICT ("platform", "platformUserId") DO NOTHING;

INSERT INTO "SocialNode" ("id", "userId", "platform", "platformUserId", "username", "createdAt")
SELECT gen_random_uuid(), u."id", 'slack', u."slackId", u."username", u."createdAt"
FROM "User" u
WHERE u."slackId" IS NOT NULL AND u."slackId" <> ''
ON CONFLICT ("platform", "platformUserId") DO NOTHING;
