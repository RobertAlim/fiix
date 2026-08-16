-- 0059 — two additions, both for this release:
--   1. staffGpsLocations  — the per-user GPS pin an Admin/Scheduler must be
--      standing at to Time In/Out (Staff GPS Location module, Super Admin).
--   2. maintenanceResolutions — the audit trail written when an Admin marks
--      a Pending Maintenance item resolved.
--
-- Written idempotently per this project's standing convention: drizzle-orm's
-- neon-http migrator has no real transactions over HTTP and tracks progress
-- with a single high-water-mark timestamp written only after a whole file's
-- SQL has executed, so a mid-file failure leaves partial DDL applied with no
-- record of it and a retry reruns this file from the top. Every ADD
-- COLUMN/TABLE uses IF NOT EXISTS and every ADD CONSTRAINT is wrapped in a
-- DO block swallowing duplicate_object AND duplicate_table (Postgres raises
-- the latter, not the former, when a constraint's implicit index name
-- collides).
--
-- NOTE ON THE "Super Admin" ROLE: no DDL is needed for it. `users.role` is a
-- plain varchar(15) with no CHECK constraint or enum, and "Super Admin" is
-- 11 characters, so it fits the existing column as-is. The first Super
-- Admin is created through Role Assignment — see the bootstrap fallback in
-- lib/require-role.ts, which lets an Admin reach Role Assignment for exactly
-- as long as zero Super Admins exist.

CREATE TABLE IF NOT EXISTS "staffGpsLocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"label" varchar(60) DEFAULT 'Office' NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"radiusMeters" integer DEFAULT 150 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "staffGpsLocations" ADD CONSTRAINT "staffGpsLocations_userId_unique" UNIQUE ("userId");
EXCEPTION
	WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "staffGpsLocations" ADD CONSTRAINT "staffGpsLocations_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "maintenanceResolutions" (
	"id" serial PRIMARY KEY NOT NULL,
	"maintainId" integer NOT NULL,
	"resolvedByUserId" integer NOT NULL,
	"resolvedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "maintenanceResolutions" ADD CONSTRAINT "maintenanceResolutions_maintainId_unique" UNIQUE ("maintainId");
EXCEPTION
	WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "maintenanceResolutions" ADD CONSTRAINT "maintenanceResolutions_maintainId_maintain_id_fk" FOREIGN KEY ("maintainId") REFERENCES "public"."maintain"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "maintenanceResolutions" ADD CONSTRAINT "maintenanceResolutions_resolvedByUserId_users_id_fk" FOREIGN KEY ("resolvedByUserId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
