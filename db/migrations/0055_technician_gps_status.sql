-- technicianGpsStatus — latest live GPS ping per technician, for GPS
-- Monitoring. Written idempotently per the standing neon-http-migrator
-- risk documented elsewhere in this project: it has no real transactions
-- over HTTP and tracks progress via a single high-water-mark timestamp
-- written only after every pending migration's SQL has fully executed, so
-- a mid-file failure leaves partial DDL applied with no record of it and a
-- retry reruns this file from the top.
CREATE TABLE IF NOT EXISTS "technicianGpsStatus" (
	"technicianId" integer PRIMARY KEY NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"accuracy" double precision,
	"gpsEnabled" boolean DEFAULT false NOT NULL,
	"capturedAt" timestamp with time zone,
	"lastOffAlertAt" timestamp with time zone,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "technicianGpsStatus" ADD CONSTRAINT "technicianGpsStatus_technicianId_users_id_fk" FOREIGN KEY ("technicianId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	-- Postgres raises duplicate_table (not duplicate_object) when a
	-- constraint's implicit index name collides — both are swallowed, per
	-- the gap the earlier 0051/0054 idempotency fixes caught.
	WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
