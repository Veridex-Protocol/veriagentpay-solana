-- Staged referral milestones, campaign attribution, and growth funnel telemetry.

-- 1. User: device fingerprint (anti-Sybil) + signup attribution
ALTER TABLE "User"
  ADD COLUMN "deviceFingerprint" TEXT,
  ADD COLUMN "signupSrc" TEXT,
  ADD COLUMN "signupCampaign" TEXT;

CREATE INDEX "User_deviceFingerprint_idx" ON "User"("deviceFingerprint");

-- 2. Referral: staged milestone tracking + attribution
ALTER TABLE "Referral"
  ADD COLUMN "walletCreated" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "walletCreatedAt" TIMESTAMP(3),
  ADD COLUMN "firstSendCompleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "firstSendAt" TIMESTAMP(3),
  ADD COLUMN "depositRetainedD7" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "milestoneCompletedAt" TIMESTAMP(3),
  ADD COLUMN "src" TEXT,
  ADD COLUMN "campaign" TEXT,
  ADD COLUMN "partner" TEXT,
  ADD COLUMN "channel" TEXT;

CREATE INDEX "Referral_referrerId_walletCreated_idx" ON "Referral"("referrerId", "walletCreated");
CREATE INDEX "Referral_firstSendCompleted_depositRetainedD7_idx" ON "Referral"("firstSendCompleted", "depositRetainedD7");

-- Backfill: referrals that already exist were created under the old
-- "award 100 immediately on signup" model. Treat them as fully completed so the
-- new staged cron does not double-award points to historical referrers.
UPDATE "Referral"
SET "walletCreated" = true,
    "walletCreatedAt" = "createdAt",
    "firstSendCompleted" = true,
    "firstSendAt" = "createdAt",
    "depositRetainedD7" = true,
    "milestoneCompletedAt" = "createdAt"
WHERE "points" > 0;

-- 3. ShortLink: campaign attribution
ALTER TABLE "ShortLink"
  ADD COLUMN "src" TEXT,
  ADD COLUMN "campaign" TEXT,
  ADD COLUMN "partner" TEXT,
  ADD COLUMN "channel" TEXT,
  ADD COLUMN "refCode" TEXT;

CREATE INDEX "ShortLink_campaign_createdAt_idx" ON "ShortLink"("campaign", "createdAt");
CREATE INDEX "ShortLink_src_createdAt_idx" ON "ShortLink"("src", "createdAt");

-- 4. FunnelEvent: append-only growth telemetry
CREATE TABLE "FunnelEvent" (
  "id" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "userId" TEXT,
  "campaign" TEXT,
  "partner" TEXT,
  "channel" TEXT,
  "src" TEXT,
  "dedupeKey" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FunnelEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FunnelEvent_dedupeKey_key" ON "FunnelEvent"("dedupeKey");
CREATE INDEX "FunnelEvent_event_createdAt_idx" ON "FunnelEvent"("event", "createdAt");
CREATE INDEX "FunnelEvent_campaign_event_idx" ON "FunnelEvent"("campaign", "event");
CREATE INDEX "FunnelEvent_userId_event_idx" ON "FunnelEvent"("userId", "event");
CREATE INDEX "FunnelEvent_src_event_createdAt_idx" ON "FunnelEvent"("src", "event", "createdAt");

ALTER TABLE "FunnelEvent"
  ADD CONSTRAINT "FunnelEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
