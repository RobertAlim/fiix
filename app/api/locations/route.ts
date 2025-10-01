import { db } from "@/db";
import { locations } from "@/db/schema";
import { NextResponse } from "next/server";

export async function GET() {
	const data = await db
		.select({
			id: locations.id,
			clientId: locations.clientId,
			name: locations.name,
		})
		.from(locations)
		.orderBy(locations.id);

	if (!data) {
		return NextResponse.json(
			{ error: "No matching item found" },
			{ status: 404 }
		);
	}

	return NextResponse.json(data, { status: 200 });
}
