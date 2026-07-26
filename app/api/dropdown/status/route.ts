import { NextResponse } from "next/server";
import { getStatus } from "@/lib/fetchDropDownData";
import { requireActiveUser } from "@/lib/require-role";

export async function GET() {
	const authResult = await requireActiveUser();
	if (authResult.error) return authResult.error;

	const status = await getStatus();
	return NextResponse.json(status);
}
