-- Cleanup duplicate pool members before adding unique constraint
-- Keep the member with the highest depositedAmount, or the earliest joinedAt if amounts are equal

-- Step 1: Identify and delete duplicate members, keeping only one per (poolId, userIdentifier)
WITH duplicates AS (
  SELECT
    id,
    poolId,
    userIdentifier,
    depositedAmount,
    joinedAt,
    ROW_NUMBER() OVER (
      PARTITION BY "poolId", "userIdentifier"
      ORDER BY "depositedAmount" DESC, "joinedAt" ASC
    ) as rn
  FROM "PoolMember"
)
DELETE FROM "PoolMember"
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Step 2: Show remaining duplicates (should be empty after cleanup)
SELECT
  "poolId",
  "userIdentifier",
  COUNT(*) as count
FROM "PoolMember"
GROUP BY "poolId", "userIdentifier"
HAVING COUNT(*) > 1;
