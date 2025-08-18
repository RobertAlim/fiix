import { NextResponse } from "next/server";
import { getPHTime } from "@/lib/getPhTime";

export async function GET() {
	const time = await getPHTime();
	return NextResponse.json({ time });
}
