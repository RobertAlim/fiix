-- 0065 — Adds `collections`: payment/collection records for a
-- "Collection"-type Support Service, entered by an Admin/Scheduler from
-- Task Tracker's Schedule Details card. `amountCentavos` stores currency
-- as integer centavos to avoid floating-point rounding errors.
--
-- Written idempotently per this project's standing convention (see the
-- note at the top of 0059) — safe to re-run.

CREATE TABLE IF NOT EXISTS "collections" (
	"id" serial PRIMARY KEY NOT NULL,
	"clientId" integer NOT NULL,
	"supportServiceId" integer NOT NULL,
	"scheduleId" integer NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"amountCentavos" integer NOT NULL,
	"status" varchar(10) NOT NULL,
	"modeOfPayment" varchar(20) NOT NULL,
	"receivedAt" date NOT NULL,
	"bankName" text,
	"checkNo" text,
	"notes" text,
	"createdBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "collections_client_month_year_amount_unique" UNIQUE("clientId","month","year","amountCentavos")
);
--> statement-breakpoint
-- Task Tracker's Schedule Details card looks up "does a collection
-- already exist for this schedule" on every load.
CREATE INDEX IF NOT EXISTS "collections_scheduleId_idx" ON "collections" ("scheduleId");
