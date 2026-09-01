-- Links a pool row to its GroupLendingPool id.
--
-- Without it the backend transferred deposits into the contract as raw ERC-20
-- sends, so `memberShares` stayed zero and the funds could never be withdrawn.
-- Existing rows are left NULL: they have no on-chain counterpart and cannot be
-- given one retroactively.
ALTER TABLE "GroupPool" ADD COLUMN "onChainPoolId" INTEGER;
CREATE UNIQUE INDEX "GroupPool_onChainPoolId_key" ON "GroupPool"("onChainPoolId");
