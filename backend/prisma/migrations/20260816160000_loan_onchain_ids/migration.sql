-- Links a loan application to its on-chain request and, once disbursed, its
-- loan. Without these the backend could not address a loan in the contract, so
-- it disbursed from the relayer's own wallet instead of from the pool.
ALTER TABLE "LoanApplication"
  ADD COLUMN "onChainRequestId" INTEGER,
  ADD COLUMN "onChainLoanId" INTEGER;
