CREATE TABLE "maintain" (
	"id" serial PRIMARY KEY NOT NULL,
	"printerId" integer NOT NULL,
	"clientId" integer NOT NULL,
	"locationId" integer,
	"departmentId" integer,
	"serialNo" varchar(50),
	"headClean" boolean DEFAULT false,
	"inkFlush" boolean DEFAULT false,
	"goodCondition" boolean DEFAULT false,
	"cleanPrinter" boolean DEFAULT false,
	"cleanWasteTank" boolean DEFAULT false,
	"notes" text,
	"userId" integer NOT NULL,
	"signatoryId" integer NOT NULL,
	"technicianId" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
