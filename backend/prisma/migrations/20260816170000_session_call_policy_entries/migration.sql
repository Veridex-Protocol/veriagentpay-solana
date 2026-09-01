-- The canonical set of (contract, function) pairs a session key may reach.
--
-- Vault allowlists are stamped in at creation and the factory has no setter, so
-- a redeployed protocol contract leaves every existing vault refusing the new
-- address. Holding the list in the database makes adding a contract an
-- operational change rather than a code deploy.
CREATE TABLE "SessionCallPolicyEntry" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "selector" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SessionCallPolicyEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SessionCallPolicyEntry_target_selector_key"
    ON "SessionCallPolicyEntry"("target", "selector");
CREATE INDEX "SessionCallPolicyEntry_allowed_idx" ON "SessionCallPolicyEntry"("allowed");
