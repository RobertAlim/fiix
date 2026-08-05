ALTER TABLE "smsRecipients" ADD COLUMN IF NOT EXISTS "userId" integer;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "smsRecipients" ADD CONSTRAINT "smsRecipients_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
