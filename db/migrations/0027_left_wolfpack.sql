CREATE TABLE "deployments" (
	"id" serial PRIMARY KEY NOT NULL,
	"printerId" integer NOT NULL,
	"modelId" integer NOT NULL,
	"clientId" integer NOT NULL,
	"locationId" integer NOT NULL,
	"departmentId" integer NOT NULL,
	"deploymentDate" date NOT NULL,
	"deployedHere" boolean NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
