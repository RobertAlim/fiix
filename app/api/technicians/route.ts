import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
	const data = await db
		.select({
			id: users.id,
			name: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
		})
		.from(users)
		.where(eq(users.role, "Technician"))
		.orderBy(users.lastName, users.firstName);

	if (!data) {
		return NextResponse.json(
			{ error: "No matching item found" },
			{ status: 404 }
		);
	}

	return NextResponse.json(data, { status: 200 });
}
