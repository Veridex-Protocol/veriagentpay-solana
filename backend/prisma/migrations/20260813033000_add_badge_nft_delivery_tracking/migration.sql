ALTER TABLE "UserBadge"
  ADD COLUMN "nftStatus" TEXT NOT NULL DEFAULT 'NOT_MINTED',
  ADD COLUMN "nftContractAddress" TEXT,
  ADD COLUMN "nftTokenId" TEXT,
  ADD COLUMN "nftTxHash" TEXT,
  ADD COLUMN "mintedAt" TIMESTAMP(3);

CREATE INDEX "UserBadge_badgeId_nftStatus_idx"
  ON "UserBadge"("badgeId", "nftStatus");
