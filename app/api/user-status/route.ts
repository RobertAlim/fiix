// app/api/user-status/route.ts

import { getUserStatus } from "@/lib/user-status";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
	const { searchParams } = new URL(req.url);
	const userId = searchParams.get("userId");

	if (!userId) {
		return NextResponse.json({ error: "Missing userId" }, { status: 400 });
	}

	const user = await getUserStatus(userId);

	if (!user[0]) {
		return NextResponse.json({ error: "User not found" }, { status: 404 });
	}

	return NextResponse.json({ isActive: user[0].isActive });
}
