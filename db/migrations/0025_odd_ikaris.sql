ALTER TABLE "maintain" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila';--> statement-breakpoint
ALTER TABLE "printers" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila';--> statement-breakpoint
ALTER TABLE "schedules" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "schedules" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila';