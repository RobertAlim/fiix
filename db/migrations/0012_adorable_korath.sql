CREATE TABLE "job" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL,
	"subname" varchar(100)
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"mtId" integer NOT NULL,
	"jobId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduleDetails" (
	"id" serial PRIMARY KEY NOT NULL,
	"scheduleId" integer NOT NULL,
	"printerId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"clientId" integer NOT NULL,
	"locationId" integer NOT NULL,
	"maintainAll" boolean DEFAULT false,
	"scheduledAt" date NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE "status" CASCADE;--> statement-breakpoint
DROP TABLE "statuses" CASCADE;