import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

// Migrations need Neon's DIRECT (unpooled) connection string, not the
// pooled one the app uses at runtime. Neon's PgBouncer-based pooler runs in
// transaction-pooling mode, which doesn't reliably support the session/
// transaction semantics drizzle-kit's migrator relies on — the observed
// symptom is exactly "no error, exits normally, nothing applied," since the
// underlying @neondatabase/serverless websocket driver has no clear failure
// path for this and just returns quietly. Add DATABASE_URL_UNPOOLED (the
// name Neon's own Vercel integration uses) to .env.local with the "Direct
// connection" string from the Neon dashboard — same project/branch, just
// without "-pooler" in the hostname. Falls back to DATABASE_URL so this
// doesn't break before that's set, but migrations may silently no-op until
// it is.
const migrationUrl =
	process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!;

export default defineConfig({
	dialect: "postgresql",
	schema: "./db/schema.ts",
	out: "./db/migrations",
	dbCredentials: { url: migrationUrl },
});
