import { db } from "@/db";
import { clients } from "@/db/schema";
import { asc } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
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
