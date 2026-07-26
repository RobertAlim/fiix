// lib/master-data/reference-check.ts
import "server-only";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export interface ReferenceCheck {
	label: string; // human-readable, e.g. "locations"
	column: AnyPgColumn;
}

/**
 * Returns a clear error message if any of the given columns still reference
 * this id, or null if it's safe to delete. There are no FK constraints at
 * the database level in this schema, so this check IS the referential
 * integrity enforcement — skipping it would let deletes silently orphan
 * rows in schedules, maintenance records, deployments, etc.
 */
export async function checkStillReferenced(
	id: number,
	checks: ReferenceCheck[]
): Promise<string | null> {
	for (const check of checks) {
		const [row] = await db
			.select({ count: sql<number>`COUNT(*)` })
			.from(check.column.table)
			.where(sql`${check.column} = ${id}`);
		const count = Number(row?.count ?? 0);
		if (count > 0) {
			return `Cannot delete — still referenced by ${count} ${check.label} record${
				count === 1 ? "" : "s"
			}.`;
		}
	}
	return null;
}
