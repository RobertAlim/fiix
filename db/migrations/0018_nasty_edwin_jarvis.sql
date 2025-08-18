CREATE TABLE "priorities" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" varchar(6) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scheduleDetails" ADD COLUMN "priority" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduleDetails" ADD COLUMN "notes" text;