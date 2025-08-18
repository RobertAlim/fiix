DROP TABLE "replaceUnit" CASCADE;--> statement-breakpoint
ALTER TABLE "maintain" RENAME COLUMN "unitReplaceId" TO "serialNo";
ALTER COLUMN serialNo TYPE varchar(50);