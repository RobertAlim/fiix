CREATE TABLE "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "colors" (
	"id" serial PRIMARY KEY NOT NULL,
	"mtId" integer NOT NULL,
	"cyan" boolean,
	"magenta" boolean,
	"yellow" boolean,
	"black" boolean
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintain" (
	"id" serial PRIMARY KEY NOT NULL,
	"printerId" integer NOT NULL,
	"clientId" integer NOT NULL,
	"departmentId" integer,
	"unitReplaceId" integer,
	"userId" integer NOT NULL,
	"signatoryId" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "models" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(20) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "printers" (
	"id" serial PRIMARY KEY NOT NULL,
	"serialNo" varchar(50) NOT NULL,
	"modelId" integer NOT NULL,
	"clientId" integer NOT NULL,
	"departmentId" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repair" (
	"id" serial PRIMARY KEY NOT NULL,
	"mtId" integer NOT NULL,
	"partId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replace" (
	"id" serial PRIMARY KEY NOT NULL,
	"mtId" integer NOT NULL,
	"partId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resets" (
	"id" serial PRIMARY KEY NOT NULL,
	"mtId" integer NOT NULL,
	"box" boolean,
	"program" boolean
);
--> statement-breakpoint
CREATE TABLE "signatories" (
	"id" serial PRIMARY KEY NOT NULL,
	"firstName" varchar(20) NOT NULL,
	"lastName" varchar(20) NOT NULL,
	"clientId" integer
);
--> statement-breakpoint
CREATE TABLE "status" (
	"id" serial PRIMARY KEY NOT NULL,
	"mtId" integer NOT NULL,
	"statusId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statuses" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL,
	"subname" varchar(100)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"firstName" varchar(20) NOT NULL,
	"lastName" varchar(20) NOT NULL,
	"middleName" varchar(20),
	"contactNo" varchar(11) NOT NULL,
	"birthday" date NOT NULL,
	"email" varchar(50) NOT NULL,
	"role" varchar(15),
	"isActive" boolean DEFAULT false,
	"clerkId" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
