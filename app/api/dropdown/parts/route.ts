import { NextResponse } from "next/server";
import { getParts } from "@/lib/fetchDropDownData";
import { requireActiveUser } from "@/lib/require-role";

export async function GET() {
	const authResult = await requireActiveUser();
	if (authResult.error) return authResult.error;

	const parts = await getParts();
	return NextResponse.json(parts);
}
