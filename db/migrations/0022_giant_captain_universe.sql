ALTER TABLE "scheduleDetails" ADD COLUMN "mtId" integer;--> statement-breakpoint
ALTER TABLE "scheduleDetails" ADD COLUMN "isMaintained" boolean DEFAULT false NOT NULL;