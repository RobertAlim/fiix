-- ALTER TABLE "schedules" ADD COLUMN "priority" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- ALTER TABLE "schedules" ADD COLUMN "notes" text;--> statement-breakpoint
-- ALTER TABLE "scheduleDetails" DROP COLUMN "priority";--> statement-breakpoint
-- ALTER TABLE "scheduleDetails" DROP COLUMN "notes";

import { sql } from "drizzle-orm";

export async function up({ db }) {
  // Drop the table if it exists
  await db.execute(sql`DROP TABLE IF EXISTS schedules`);

  // Recreate the table
  await db.execute(sql`
    CREATE TABLE schedules (
      id SERIAL PRIMARY KEY,
      technicianId INTEGER NOT NULL,
      clientId INTEGER NOT NULL,
      locationId INTEGER NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      maintainAll BOOLEAN DEFAULT false,
      scheduledAt DATE NOT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

export async function down({ db }) {
  // Optional: drop the table during rollback
  await db.execute(sql`DROP TABLE IF EXISTS schedules`);
}
