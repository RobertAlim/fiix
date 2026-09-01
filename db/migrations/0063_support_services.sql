-- 0063 — Support Services: adds `supportServiceType` (selectable
-- categories: 2307 BIR Form, Collection, Billing, Contracts, Others) and
-- `supportServices` (a technician's non-maintenance scheduled work — client
-- visits with no printer attached, completed the same way a `schedules` row
-- is completed via `scheduleDetails.isMaintained`, just on its own row).
--
-- Written idempotently per this project's standing convention (see the note
-- at the top of 0059) — safe to re-run. Both tables are brand new, so a
-- plain `CREATE TABLE IF NOT EXISTS` with inline constraints is sufficient
-- on its own; no separate `DO $$ ... ADD CONSTRAINT` block is needed since
-- nothing here alters an EXISTING table.
--
-- No foreign keys to clients/locations/users/signatories, matching
-- `schedules`' own established convention in this same database — referential
-- integrity for this table is enforced in application code, not the DB,
-- same as it already is for schedules.

CREATE TABLE IF NOT EXISTS "supportServiceType" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "supportServiceType_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supportServices" (
	"id" serial PRIMARY KEY NOT NULL,
	"clientId" integer NOT NULL,
	"locationId" integer NOT NULL,
	"supportServiceTypeId" integer NOT NULL,
	"technicianId" integer NOT NULL,
	"scheduledAt" date NOT NULL,
	"sequence" integer,
	"notes" text,
	"status" varchar(20),
	"technicianNotes" text,
	"signatoryId" integer,
	"photoUrl" text,
	"signatureUrl" text,
	"gpsLatitude" double precision,
	"gpsLongitude" double precision,
	"gpsAccuracy" double precision,
	"gpsCapturedAt" timestamp,
	"clientUuid" uuid,
	"completedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "supportServices_clientUuid_unique" UNIQUE("clientUuid")
);
--> statement-breakpoint
-- Every list/dashboard read filters by (technicianId, scheduledAt) — see
-- app/api/support-services/route.ts and the lastStop lookup in
-- app/api/attendance/status/route.ts. Same reasoning as any other
-- frequently-filtered pair in this app.
CREATE INDEX IF NOT EXISTS "supportServices_technician_date_idx"
	ON "supportServices" ("technicianId", "scheduledAt");
--> statement-breakpoint
-- Seed the initial categories from the request. ON CONFLICT DO NOTHING is
-- what makes this re-runnable — without it, a retry after a partial file
-- failure would hit the unique constraint on "name".
INSERT INTO "supportServiceType" ("name") VALUES
	('2307 BIR Form'),
	('Collection'),
	('Billing'),
	('Contracts'),
	('Others')
ON CONFLICT ("name") DO NOTHING;
