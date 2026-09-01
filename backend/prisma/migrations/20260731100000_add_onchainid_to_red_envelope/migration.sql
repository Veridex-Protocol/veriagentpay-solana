-- AlterTable
ALTER TABLE "RedEnvelope" ADD COLUMN IF NOT EXISTS "onChainId" INTEGER;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RedEnvelope_onChainId_idx" ON "RedEnvelope"("onChainId");
