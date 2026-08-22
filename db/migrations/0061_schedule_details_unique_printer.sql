-- 0061 — cleans up duplicate scheduleDetails rows, then adds a unique
-- constraint on (scheduleId, printerId) so a printer can never again be
-- inserted twice onto the same schedule.
--
-- ⚠️ THIS MIGRATION DELETES DATA — review before running, unlike every
-- prior migration in this project, which were purely additive. Confirmed
-- via production diagnostics that the duplicate rows are exact junk
-- copies (same status, notes, everything — traced to the schedule
-- create/edit routes being submitted twice for the same schedule in quick
-- succession, with no protection against it at the time). For each
-- (scheduleId, printerId) pair with more than one row, this keeps exactly
-- one: the row with isMaintained = true if either duplicate has it set
-- (so a maintenance link recorded on either copy is preserved), otherwise
-- the lowest id (the earliest-created, presumably original row).
--
-- Written idempotently per this project's standing convention (see the
-- note at the top of 0059) — safe to re-run; the DELETE is a no-op once
-- no duplicates remain, and the CREATE UNIQUE INDEX uses IF NOT EXISTS.

WITH ranked AS (
	SELECT
		"id",
		ROW_NUMBER() OVER (
			PARTITION BY "scheduleId", "printerId"
			ORDER BY "isMaintained" DESC, "id" ASC
		) AS rn
	FROM "scheduleDetails"
)
DELETE FROM "scheduleDetails"
WHERE "id" IN (SELECT "id" FROM ranked WHERE rn > 1);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "scheduleDetails_scheduleId_printerId_unique"
ON "scheduleDetails" USING btree ("scheduleId","printerId");
