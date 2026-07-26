// db/migrate.ts
//
// Runs pending migrations directly via drizzle-orm's neon-http migrator,
// rather than the `drizzle-kit migrate` CLI command. This is Neon's own
// documented approach (https://neon.com/docs/guides/drizzle-migrations) —
// drizzle-kit's CLI has documented, unresolved compatibility problems
// picking a working driver for Neon specifically (see
// https://github.com/drizzle-team/drizzle-orm/issues/3128 and
// https://github.com/neondatabase/neon/issues/5098), where `migrate`/`push`
// can hang or exit without applying anything and without a clear error,
// regardless of which connection string is used. This script uses the exact
// same neon-http driver already proven to work for every query db/index.ts
// makes, so there's no separate driver-selection step that can go wrong.
//
// Run with: npm run db:migrate

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { config } from "dotenv";

config({ path: ".env.local" });

// Migrations need Neon's DIRECT (unpooled) connection string — the pooled
// one runs through PgBouncer in transaction-pooling mode, which doesn't
// reliably support the session semantics schema migrations need. Falls back
// to DATABASE_URL if DATABASE_URL_UNPOOLED isn't set, matching
// drizzle.config.ts, but migrations may not apply correctly until it is.
const connectionString =
	process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!connectionString) {
	console.error(
		"DATABASE_URL_UNPOOLED (or DATABASE_URL) is not set — check .env.local."
	);
	process.exit(1);
}

const sql = neon(connectionString);
const db = drizzle(sql);

async function main() {
	console.log("Applying pending migrations...");
	const start = Date.now();
	try {
		await migrate(db, { migrationsFolder: "./db/migrations" });
		console.log(`Migration completed in ${Date.now() - start}ms`);
	} catch (error) {
		console.error("Error during migration:", error);
		process.exit(1);
	}
}

main();
