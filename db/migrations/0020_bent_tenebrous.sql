-- ALTER TABLE "printers" ADD COLUMN "deploymentDate" date NOT NULL;
DROP TABLE IF EXISTS "printers";--> statement-breakpoint
CREATE TABLE "printers" (
	"id" SERIAL PRIMARY KEY,
	"serialNo" VARCHAR(50) NOT NULL,
	"modelId" INTEGER NOT NULL,
	"clientId" INTEGER NOT NULL,
	"locationId" INTEGER NOT NULL,
	"departmentId" INTEGER NOT NULL,
	"deploymentDate" DATE NOT NULL,
	"deployedClient" INTEGER NOT NULL,
	"createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
