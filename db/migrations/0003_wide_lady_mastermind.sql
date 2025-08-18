CREATE TABLE "replaceUnit" (
	"id" serial PRIMARY KEY NOT NULL,
	"mtId" integer NOT NULL,
	"serialNo" varchar(50) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "maintain" ADD COLUMN "notes" text;