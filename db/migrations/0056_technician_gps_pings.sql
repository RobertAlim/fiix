-- technicianGpsPings — append-only log of every real GPS fix, feeding GPS
-- Monitoring's "path traveled today" trail. Separate from
-- technicianGpsStatus (single upserted row, latest fix only) by design —
-- see the doc comment on the table in db/schema.ts for why both exist.
--
-- Written idempotently per the standing neon-http-migrator risk documented
-- elsewhere in this project: it has no real transactions over HTTP and
-- tracks progress via a single high-water-mark timestamp written only
-- after every pending migration's SQL has fully executed, so a mid-file
-- failure leaves partial DDL applied with no record of it and a retry
-- reruns this file from the top.
CREATE TABLE IF NOT EXISTS "technicianGpsPings" (
	"id" serial PRIMARY KEY NOT NULL,
	"technicianId" integer NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"accuracy" double precision,
	"capturedAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "technicianGpsPings" ADD CONSTRAINT "technicianGpsPings_technicianId_users_id_fk" FOREIGN KEY ("technicianId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	-- Postgres raises duplicate_table (not duplicate_object) when a
	-- constraint's implicit index name collides — both are swallowed, per
	-- the gap the earlier 0051/0054 idempotency fixes caught.
	WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "technicianGpsPings_technicianId_capturedAt_idx" ON "technicianGpsPings" ("technicianId","capturedAt");
