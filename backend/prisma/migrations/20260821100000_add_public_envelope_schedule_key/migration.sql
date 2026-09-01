-- Lets scheduled drops use a database-enforced idempotency key.  This matters
-- when more than one application instance receives the same cron tick.
ALTER TABLE "PublicEnvelope" ADD COLUMN "scheduleKey" TEXT;

CREATE UNIQUE INDEX "PublicEnvelope_scheduleKey_key"
  ON "PublicEnvelope"("scheduleKey");
