import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

// Next.js loads .env.local itself; drizzle-kit scripts load it via
// drizzle.config.ts — the runtime dotenv call here was redundant.
if (!process.env.DATABASE_URL) {
	throw new Error("DATABASE_URL is not set");
}

const sql = neon(process.env.DATABASE_URL);
export const db = drizzle(sql, { schema });
