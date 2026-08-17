-- 0060 — two additions:
--   1. printers.status ("Active" | "Missing") for the Transfer Printer
--      dialog's new Missing/Found actions.
--   2. Seeds a "Resolved" row into the `status` lookup table (the same one
--      maintain.statusId points into) so the Pending Maintenance Resolve
--      action has a status to set. `status` has no unique constraint on
--      `name`, so this is written as an existence-checked INSERT rather than
--      ON CONFLICT, and is safe to re-run.
--
-- Written idempotently per this project's standing convention — see the
-- note at the top of 0059 for why (neon-http's migrator has no real
-- transactions and tracks progress with a single high-water-mark
-- timestamp, so a mid-file failure on retry re-runs this file from the top).

ALTER TABLE "printers" ADD COLUMN IF NOT EXISTS "status" varchar(20) NOT NULL DEFAULT 'Active';
--> statement-breakpoint
INSERT INTO "status" ("name")
SELECT 'Resolved'
WHERE NOT EXISTS (SELECT 1 FROM "status" WHERE "name" = 'Resolved');
