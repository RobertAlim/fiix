import { db } from "@/db";
import { priorities } from "@/db/schema";
import { asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/require-role";

export async function GET() {
	const authResult = await requireRole(["Admin", "Scheduler"]);
	if (authResult.error) return authResult.error;

	const data = await db
		.select({
			id: priorities.id,
			name: priorities.name,
		})
		.from(priorities)
		.orderBy(asc(priorities.id));

	if (!data) {
		return NextResponse.json(
			{ error: "No matching item found" },
			{ status: 404 }
		);
	}

	return NextResponse.json(data, { status: 200 });
}
