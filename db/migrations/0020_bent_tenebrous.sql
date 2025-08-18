-- ALTER TABLE "printers" ADD COLUMN "deploymentDate" date NOT NULL;

import { sql } from "drizzle-orm";

export async function up({ db }) {
  // Drop the table if it exists
  await db.execute(sql`DROP TABLE IF EXISTS printers`);

  // Recreate the table
  await db.execute(sql`
    CREATE TABLE printers (
      id SERIAL PRIMARY KEY,
      serialNo VARCHAR(50) NOT NULL,
      modelId INTEGER NOT NULL,
      clientId INTEGER NOT NULL,
      locationId INTEGER NOT NULL,
      departmentId INTEGER NOT NULL,
      deploymentDate DATE NOT NULL,
      deployedClient INTEGER NOT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

export async function down({ db }) {
  // Optional: drop the table during rollback
  await db.execute(sql`DROP TABLE IF EXISTS printers`);
}