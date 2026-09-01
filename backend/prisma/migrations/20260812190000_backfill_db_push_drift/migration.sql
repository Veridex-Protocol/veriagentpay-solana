-- Backfills every schema object that existed only via `prisma db push`.
--
-- The migration history captured a fraction of the real schema: 11 tables,
-- 2 enums, 35 enum values, several columns and a number of indexes and foreign
-- keys were present in schema.prisma and in developer databases, but no
-- migration ever created them. Databases built incrementally with `db push`
-- looked fine; any environment provisioned from migrations alone — CI, a new
-- machine, a rebuilt staging — did not have them.
--
-- Generated with:
--   prisma migrate diff \
--     --from-schema-datasource prisma/schema.prisma \
--     --to-schema-datamodel  prisma/schema.prisma \
--     --script
--
-- The DROP INDEX below is deliberate. `User_deviceFingerprint_idx` was created
-- by 20260811120000 but schema.prisma declares no such index, and no query
-- filters on `deviceFingerprint` alone — referral.service.ts only ever selects
-- it after a primary-key lookup, or constrains it alongside `id`. The index
-- served no reads.
--
-- Going forward use `prisma migrate dev` rather than `prisma db push`, so the
-- history stays a complete description of the schema.

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'FINANCE', 'SUPPORT', 'VIEWER');

-- CreateEnum
CREATE TYPE "BillSplitStatus" AS ENUM ('PENDING', 'PARTIAL', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'POOL_INVITATION';
ALTER TYPE "NotificationType" ADD VALUE 'POOL_LOAN_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'POOL_LOAN_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'POOL_LOAN_REPAID';
ALTER TYPE "NotificationType" ADD VALUE 'BADGE_EARNED';
ALTER TYPE "NotificationType" ADD VALUE 'VAULT_DEPOSIT';
ALTER TYPE "NotificationType" ADD VALUE 'VAULT_WITHDRAWAL';
ALTER TYPE "NotificationType" ADD VALUE 'ENVELOPE_CREATED';
ALTER TYPE "NotificationType" ADD VALUE 'MONEY_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'MONEY_SENT';
ALTER TYPE "NotificationType" ADD VALUE 'SUBSCRIPTION_SUCCESS';
ALTER TYPE "NotificationType" ADD VALUE 'SUBSCRIPTION_FAILED';
ALTER TYPE "NotificationType" ADD VALUE 'ADMIN_ALERT';
ALTER TYPE "NotificationType" ADD VALUE 'SPLIT_PAID';
ALTER TYPE "NotificationType" ADD VALUE 'SPLIT_COMPLETED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UserActivityAction" ADD VALUE 'USER_REGISTERED';
ALTER TYPE "UserActivityAction" ADD VALUE 'ONBOARDING_COMPLETED';
ALTER TYPE "UserActivityAction" ADD VALUE 'WALLET_CREATED';
ALTER TYPE "UserActivityAction" ADD VALUE 'PASSKEY_REGISTERED';
ALTER TYPE "UserActivityAction" ADD VALUE 'SESSION_KEY_CREATED';
ALTER TYPE "UserActivityAction" ADD VALUE 'REQUEST_CREATED';
ALTER TYPE "UserActivityAction" ADD VALUE 'REQUEST_PAID';
ALTER TYPE "UserActivityAction" ADD VALUE 'REQUEST_CANCELLED';
ALTER TYPE "UserActivityAction" ADD VALUE 'LOAN_REQUESTED';
ALTER TYPE "UserActivityAction" ADD VALUE 'LOAN_APPROVED';
ALTER TYPE "UserActivityAction" ADD VALUE 'ENVELOPE_CANCELLED';
ALTER TYPE "UserActivityAction" ADD VALUE 'SPLIT_CREATED';
ALTER TYPE "UserActivityAction" ADD VALUE 'SPLIT_PAID';
ALTER TYPE "UserActivityAction" ADD VALUE 'CONTACT_ADDED';
ALTER TYPE "UserActivityAction" ADD VALUE 'BADGE_EARNED';
ALTER TYPE "UserActivityAction" ADD VALUE 'SUBSCRIPTION_CREATED';
ALTER TYPE "UserActivityAction" ADD VALUE 'SUBSCRIPTION_PAID';
ALTER TYPE "UserActivityAction" ADD VALUE 'SUBSCRIPTION_CANCELLED';
ALTER TYPE "UserActivityAction" ADD VALUE 'REFERRAL_REGISTERED';
ALTER TYPE "UserActivityAction" ADD VALUE 'REFERRAL_REWARDED';

-- DropIndex
DROP INDEX "User_deviceFingerprint_idx";

-- AlterTable
ALTER TABLE "Admin" ADD COLUMN     "role" "AdminRole" NOT NULL DEFAULT 'SUPER_ADMIN';

-- AlterTable
ALTER TABLE "NotificationLog" ADD COLUMN     "metadata" JSONB;

-- AlterTable
ALTER TABLE "RedEnvelope" ADD COLUMN     "txHash" TEXT;

-- AlterTable
ALTER TABLE "SessionKey" ADD COLUMN     "encryptedSymmetricKey" TEXT;

-- CreateTable
CREATE TABLE "AdminNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminOtp" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminOtp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT,
    "adminEmail" TEXT,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "details" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "retries" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillSplit" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "description" TEXT,
    "token" TEXT NOT NULL DEFAULT 'USDC',
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "contractSplitId" TEXT,
    "status" "BillSplitStatus" NOT NULL DEFAULT 'PENDING',
    "amountCollected" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deadline" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillSplit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitParticipant" (
    "id" TEXT NOT NULL,
    "splitId" TEXT NOT NULL,
    "userId" TEXT,
    "userIdentifier" TEXT NOT NULL,
    "shareAmount" DOUBLE PRECISION NOT NULL,
    "hasPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "txHash" TEXT,

    CONSTRAINT "SplitParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPayment" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "amountUSD" DECIMAL(65,30) NOT NULL,
    "txHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultDeposit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vaultId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "token" TEXT NOT NULL DEFAULT 'USDC',
    "sharesMinted" DECIMAL(65,30),
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaultDeposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultWithdrawal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vaultId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "token" TEXT NOT NULL DEFAULT 'USDC',
    "sharesBurned" DECIMAL(65,30),
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaultWithdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavingsStreak" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentStreak" INTEGER NOT NULL DEFAULT 1,
    "longestStreak" INTEGER NOT NULL DEFAULT 1,
    "lastDepositAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavingsStreak_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminNote_userId_createdAt_idx" ON "AdminNote"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminOtp_identifier_expiresAt_idx" ON "AdminOtp"("identifier", "expiresAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_adminId_createdAt_idx" ON "AdminAuditLog"("adminId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_action_createdAt_idx" ON "AdminAuditLog"("action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GlobalConfig_key_key" ON "GlobalConfig"("key");

-- CreateIndex
CREATE INDEX "PendingClaim_status_retries_idx" ON "PendingClaim"("status", "retries");

-- CreateIndex
CREATE INDEX "PendingClaim_userId_idx" ON "PendingClaim"("userId");

-- CreateIndex
CREATE INDEX "BillSplit_creatorId_idx" ON "BillSplit"("creatorId");

-- CreateIndex
CREATE INDEX "BillSplit_status_idx" ON "BillSplit"("status");

-- CreateIndex
CREATE INDEX "SplitParticipant_splitId_idx" ON "SplitParticipant"("splitId");

-- CreateIndex
CREATE INDEX "SplitParticipant_userId_idx" ON "SplitParticipant"("userId");

-- CreateIndex
CREATE INDEX "SplitParticipant_userIdentifier_idx" ON "SplitParticipant"("userIdentifier");

-- CreateIndex
CREATE INDEX "SubscriptionPayment_subscriptionId_createdAt_idx" ON "SubscriptionPayment"("subscriptionId", "createdAt");

-- CreateIndex
CREATE INDEX "VaultDeposit_userId_createdAt_idx" ON "VaultDeposit"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "VaultWithdrawal_userId_createdAt_idx" ON "VaultWithdrawal"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SavingsStreak_userId_key" ON "SavingsStreak"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PoolMember_poolId_userIdentifier_key" ON "PoolMember"("poolId", "userIdentifier");

-- AddForeignKey
ALTER TABLE "AdminNote" ADD CONSTRAINT "AdminNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminNote" ADD CONSTRAINT "AdminNote_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillSplit" ADD CONSTRAINT "BillSplit_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitParticipant" ADD CONSTRAINT "SplitParticipant_splitId_fkey" FOREIGN KEY ("splitId") REFERENCES "BillSplit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitParticipant" ADD CONSTRAINT "SplitParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultDeposit" ADD CONSTRAINT "VaultDeposit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultWithdrawal" ADD CONSTRAINT "VaultWithdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsStreak" ADD CONSTRAINT "SavingsStreak_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

