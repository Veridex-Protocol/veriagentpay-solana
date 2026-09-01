-- CreateTable
CREATE TABLE "ShortLink" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "senderUserId" TEXT,
    "targetUserId" TEXT,
    "toAddress" TEXT,
    "amount" DOUBLE PRECISION,
    "token" TEXT,
    "fromUser" TEXT,
    "platform" TEXT,
    "envelopeId" TEXT,
    "merkleProof" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "claimedBy" TEXT,
    "claimTxHash" TEXT,
    "clickCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ShortLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShortLink_code_key" ON "ShortLink"("code");

-- CreateIndex
CREATE INDEX "ShortLink_code_idx" ON "ShortLink"("code");

-- CreateIndex
CREATE INDEX "ShortLink_kind_status_idx" ON "ShortLink"("kind", "status");

-- CreateIndex
CREATE INDEX "ShortLink_targetUserId_idx" ON "ShortLink"("targetUserId");
