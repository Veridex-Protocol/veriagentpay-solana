-- A defaulted loan is a distinct event in a borrower's history, alongside
-- LOAN_REPAID. Nothing recorded it before because nothing ever marked a loan
-- defaulted at all.
ALTER TYPE "UserActivityAction" ADD VALUE 'LOAN_DEFAULTED';
