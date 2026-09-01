-- 0062 — Monitoring report support: adds `clientGroups` (proximity-based
-- clusters of nearby clients, shown as gray separator rows in the new
-- Monitoring report) and two new columns on `clients`:
--   - "area" ("South" | "North") — which half of the Monitoring report a
--     client's rows appear under.
--   - "clientGroupId" — which group (if any) a client belongs to. Both
--     nullable: an unclassified/ungrouped client is unaffected everywhere
--     else in the app, it just doesn't sort into a section/group in the
--     Monitoring report until an Admin sets these from the new Clients
--     page.
--
-- Written idempotently per this project's standing convention (see the
-- note at the top of 0059) — safe to re-run.

CREATE TABLE IF NOT EXISTS "clientGroups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"area" varchar(10) NOT NULL,
	"createdAt" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "area" varchar(10);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "clientGroupId" integer;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.table_constraints
		WHERE constraint_name = 'clients_clientGroupId_clientGroups_id_fk'
	) THEN
		ALTER TABLE "clients"
			ADD CONSTRAINT "clients_clientGroupId_clientGroups_id_fk"
			FOREIGN KEY ("clientGroupId") REFERENCES "clientGroups"("id") ON DELETE SET NULL;
	END IF;
END $$;
