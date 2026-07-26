ALTER TABLE "maintain" RENAME COLUMN "printerId" TO "deploymentId";--> statement-breakpoint
ALTER TABLE "printers" DROP COLUMN "modelId";--> statement-breakpoint
ALTER TABLE "printers" DROP COLUMN "locationId";--> statement-breakpoint
ALTER TABLE "printers" DROP COLUMN "departmentId";--> statement-breakpoint
ALTER TABLE "printers" DROP COLUMN "deploymentDate";