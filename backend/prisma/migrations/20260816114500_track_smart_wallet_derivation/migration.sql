-- A counterfactual wallet address is only meaningful together with the factory
-- and CREATE2 derivation that produced it. Existing rows predate this metadata
-- and are intentionally left NULL so the runtime can treat them as legacy.
ALTER TABLE "SmartWallet"
  ADD COLUMN "factoryAddress" TEXT,
  ADD COLUMN "derivationVersion" TEXT;
