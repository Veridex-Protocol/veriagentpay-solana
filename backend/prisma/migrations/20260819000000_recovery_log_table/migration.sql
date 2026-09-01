-- AlterEnum
ALTER TYPE "UserActivityAction" ADD VALUE 'RECOVERY_EXECUTED';

-- CreateTable
CREATE TABLE "RecoveryLog" (
    "id" TEXT NOT NULL,
    "vaultAddress" TEXT NOT NULL,
    "displacedUserId" TEXT,
    "oldOwnerKeyHash" TEXT NOT NULL,
    "newOwnerKeyHash" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "refunded" BOOLEAN NOT NULL DEFAULT false,
    "refundTxHash" TEXT,
    "refundAmount" DECIMAL(65,30),
    "refundToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryLog_txHash_key" ON "RecoveryLog"("txHash");

-- CreateIndex
CREATE INDEX "RecoveryLog_displacedUserId_idx" ON "RecoveryLog"("displacedUserId");

-- CreateIndex
CREATE INDEX "RecoveryLog_vaultAddress_idx" ON "RecoveryLog"("vaultAddress");

-- CreateIndex
CREATE INDEX "RecoveryLog_refunded_idx" ON "RecoveryLog"("refunded");
