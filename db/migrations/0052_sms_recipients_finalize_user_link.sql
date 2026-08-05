ALTER TABLE "smsRecipients" DROP CONSTRAINT IF EXISTS "smsRecipients_mobileNumber_unique";--> statement-breakpoint
ALTER TABLE "smsRecipients" ALTER COLUMN "userId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "smsRecipients" DROP COLUMN IF EXISTS "label";--> statement-breakpoint
ALTER TABLE "smsRecipients" DROP COLUMN IF EXISTS "mobileNumber";--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "smsRecipients" ADD CONSTRAINT "smsRecipients_userId_unique" UNIQUE("userId");
EXCEPTION
	WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
