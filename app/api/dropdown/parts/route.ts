import { NextResponse } from "next/server";
import { getParts } from "@/lib/fetchDropDownData";

export async function GET() {
	const parts = await getParts();
	return NextResponse.json(parts);
}
