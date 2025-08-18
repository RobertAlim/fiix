DROP TABLE "job" CASCADE;--> statement-breakpoint
DROP TABLE "jobs" CASCADE;--> statement-breakpoint
ALTER TABLE "maintain" RENAME COLUMN "serialNo" TO "replaceSerialNo";--> statement-breakpoint
ALTER TABLE "maintain" ADD COLUMN "signPath" text NOT NULL;