-- signatories.locationId — enables "same client, different location, own
-- signatories" per the explicit requirement, and duplicate-prevention
-- scoped to (firstName, lastName, clientId, locationId) instead of just
-- (firstName, lastName, clientId). Nullable: existing rows (created
-- before this column existed) have no location on file and remain valid
-- client-only signatories rather than becoming orphaned/invalid data.
--
-- Idempotent per this project's standing convention (see 0055/0056) — the
-- neon-http migrator has no real transactions over HTTP.
ALTER TABLE "signatories" ADD COLUMN IF NOT EXISTS "locationId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "signatories" ADD CONSTRAINT "signatories_locationId_locations_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
