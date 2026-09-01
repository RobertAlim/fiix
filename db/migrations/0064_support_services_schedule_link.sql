-- 0064 — Adds `supportServices.scheduleId`: the link back to a
-- printer-less `schedules` row when a Support Service originates from
-- one (a Scheduler-created client visit with no printer attached — the
-- original "documentable through this same workflow" case), as opposed
-- to a row created directly as a dedicated Support Service. Nullable —
-- only the printer-less-schedule case sets it.
--
-- Written idempotently per this project's standing convention (see the
-- note at the top of 0059) — safe to re-run.

ALTER TABLE "supportServices" ADD COLUMN IF NOT EXISTS "scheduleId" integer;
--> statement-breakpoint
-- Every "has this printer-less schedule already been documented" check
-- (GET /api/schedule's Dashboard branch) filters by this column.
CREATE INDEX IF NOT EXISTS "supportServices_scheduleId_idx"
	ON "supportServices" ("scheduleId");
