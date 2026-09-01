// app/api/dropdown/support-service-types/route.ts
//
// Same {value, label} convention as every other dropdown route in this
// app (lib/fetchDropDownData.ts's getStatus/getParts) — value is
// CAST(id AS TEXT). Only active types are returned, matching the
// isActive flag's purpose (retire a type without deleting the history
// that references it).
import { NextResponse } from "next/server";
import { db } from "@/db";
import { supportServiceType } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireActiveUser } from "@/lib/require-role";

export async function GET() {
	const authResult = await requireActiveUser();
	if (authResult.error) return authResult.error;

	const rows = await db
		.select({
			value: sql<string>`CAST(${supportServiceType.id} AS TEXT)`,
			label: supportServiceType.name,
		})
		.from(supportServiceType)
		.where(eq(supportServiceType.isActive, true));

	return NextResponse.json(rows);
}
