ALTER TABLE "maintain" ADD COLUMN IF NOT EXISTS "isBackfilled" boolean DEFAULT false NOT NULL;
