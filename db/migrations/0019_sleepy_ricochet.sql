-- ALTER TABLE "schedules" ADD COLUMN "priority" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- ALTER TABLE "schedules" ADD COLUMN "notes" text;--> statement-breakpoint
-- ALTER TABLE "scheduleDetails" DROP COLUMN "priority";--> statement-breakpoint
-- ALTER TABLE "scheduleDetails" DROP COLUMN "notes";
DROP TABLE IF EXISTS "schedules";--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" SERIAL PRIMARY KEY,
	"technicianId" INTEGER NOT NULL,
	"clientId" INTEGER NOT NULL,
	"locationId" INTEGER NOT NULL,
	"priority" INTEGER NOT NULL DEFAULT 0,
	"notes" TEXT,
	"maintainAll" BOOLEAN DEFAULT false,
	"scheduledAt" DATE NOT NULL,
	"createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
