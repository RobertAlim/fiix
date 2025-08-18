import { NextResponse } from "next/server";
import { getStatus } from "@/lib/fetchDropDownData";

export async function GET() {
	const status = await getStatus();
	return NextResponse.json(status);
}
