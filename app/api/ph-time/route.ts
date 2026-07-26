import { NextResponse } from "next/server";
import { getPHTime } from "@/lib/getPhTime";
import { requireRole } from "@/lib/require-role";

export async function GET() {
	const authResult = await requireRole(["Admin", "Scheduler"]);
	if (authResult.error) return authResult.error;

	const time = await getPHTime();
	return NextResponse.json({ time });
}
