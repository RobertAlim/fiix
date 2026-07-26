import { db } from "@/db";
import { clients } from "@/db/schema";
import { asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/require-role";

export async function GET() {
	const authResult = await requireActiveUser();
	if (authResult.error) return authResult.error;

	const data = await db
		.select({
			id: clients.id,
			name: clients.name,
		})
		.from(clients)
		.orderBy(asc(clients.name));

	if (!data) {
		return NextResponse.json(
			{ error: "No matching item found" },
			{ status: 404 }
		);
	}

	return NextResponse.json(data, { status: 200 });
}
