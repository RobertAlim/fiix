ALTER TABLE "maintain" ALTER COLUMN "serialNo" SET DATA TYPE varchar(50);--> statement-breakpoint
ALTER TABLE "maintain" ADD COLUMN "technicianId" integer NOT NULL;