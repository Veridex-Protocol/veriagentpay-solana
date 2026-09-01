-- A recipient may have several social handles but, once resolved, must be a
-- single address-book contact per owner and smart-wallet address. Consolidate
-- legacy platform/web duplicates before enforcing that invariant.
UPDATE "Contact"
SET "walletAddress" = LOWER("walletAddress")
WHERE "walletAddress" IS NOT NULL;

WITH ranked AS (
  SELECT
    "id",
    FIRST_VALUE("id") OVER (
      PARTITION BY "userId", LOWER("walletAddress")
      ORDER BY CASE WHEN "platform" = 'web' THEN 1 ELSE 0 END, "createdAt" ASC
    ) AS canonical_id,
    SUM("sendCount") OVER (PARTITION BY "userId", LOWER("walletAddress")) AS combined_send_count,
    MAX("lastSentAt") OVER (PARTITION BY "userId", LOWER("walletAddress")) AS latest_sent_at
  FROM "Contact"
  WHERE "walletAddress" IS NOT NULL
), updated AS (
  UPDATE "Contact" AS contact
  SET
    "sendCount" = ranked.combined_send_count,
    "lastSentAt" = ranked.latest_sent_at
  FROM ranked
  WHERE contact."id" = ranked.canonical_id
  RETURNING contact."id"
)
DELETE FROM "Contact" AS contact
USING ranked
WHERE contact."id" = ranked."id"
  AND ranked."id" <> ranked.canonical_id;

CREATE UNIQUE INDEX IF NOT EXISTS "Contact_userId_walletAddress_key"
  ON "Contact"("userId", "walletAddress");
