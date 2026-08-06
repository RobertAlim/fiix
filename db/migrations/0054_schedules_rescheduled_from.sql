-- schedules.rescheduledFromId — back-pointer from a rescheduled visit to the
-- original (missed) schedule it replaces. See db/schema.ts for why the
-- original row is never edited.
--
-- Written idempotently ON PURPOSE. drizzle-orm's neon-http migrator has no
-- real transactions and tracks progress with a single high-water-mark
-- timestamp written only after ALL pending migrations finish — so a failure
-- between the two statements below leaves the column applied with no record
-- of it, and the retry re-runs this file from the top and collides. Both
-- statements are therefore safe to re-run from any partial state.
ALTER TABLE "schedules" ADD COLUMN IF NOT EXISTS "rescheduledFromId" integer;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "schedules" ADD CONSTRAINT "schedules_rescheduledFromId_schedules_id_fk" FOREIGN KEY ("rescheduledFromId") REFERENCES "public"."schedules"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
	-- Postgres raises duplicate_table (not duplicate_object) when a
	-- constraint's implicit index name collides, so both are swallowed.
	WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
