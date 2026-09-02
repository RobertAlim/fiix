-- 0066 — Converts `collections.amountCentavos` (integer centavos) to
-- `collections.amount` (numeric(12,2), exact decimal pesos). Postgres's
-- `numeric` type is exact arbitrary-precision decimal, not floating
-- point, so this keeps the same "no rounding error" guarantee the
-- integer-centavos design was originally for, while storing the actual
-- peso amount (e.g. 1500.00) directly instead of a derived integer
-- (150000) — see db/schema.ts's own comment on the `collections` table
-- for the full reasoning.
--
-- Written idempotently per this project's standing convention (see the
-- note at the top of 0059): guarded so re-running this after it has
-- already applied is a no-op rather than an error (a second RENAME
-- COLUMN on an already-renamed column would otherwise fail outright).
--
-- Existing rows are preserved and correctly converted (divided by 100)
-- as part of the type change — RENAME COLUMN alone doesn't touch data,
-- and the ALTER COLUMN ... TYPE ... USING clause is what actually
-- reinterprets the stored integer centavos as the equivalent decimal
-- peso value, not just relabels it.

DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_name = 'collections' AND column_name = 'amountCentavos'
	) THEN
		ALTER TABLE "collections" RENAME COLUMN "amountCentavos" TO "amount";
		ALTER TABLE "collections"
			ALTER COLUMN "amount" TYPE numeric(12, 2)
			USING ("amount"::numeric / 100);
	END IF;
END $$;
