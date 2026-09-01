-- Annual simple interest on pool loans, in basis points.
--
-- The create form has always collected a rate and the API has always accepted
-- it, but nothing persisted it — so every loan was interest-free regardless of
-- what the pool agreed. Existing pools default to 0, which is what they have
-- actually been charging.
ALTER TABLE "GroupPool" ADD COLUMN "interestRateBps" INTEGER NOT NULL DEFAULT 0;
