CREATE TABLE "locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"clientId" integer NOT NULL,
	"name" varchar(50) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "maintain" ADD COLUMN "locationId" integer;