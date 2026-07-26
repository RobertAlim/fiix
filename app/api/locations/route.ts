import { db } from "@/db";
import { locations } from "@/db/schema";
import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/require-role";

export async function GET() {
	const authResult = await requireActiveUser();
	if (authResult.error) return authResult.error;

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
