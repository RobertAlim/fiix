// app/api/user-status/route.ts

import { getUserStatus } from "@/lib/user-status";
import { NextResponse } from "next/server";
// import { useUserStore } from "@/state/userStore";

export async function GET(req: Request) {
	const { searchParams } = new URL(req.url);
	const userId = searchParams.get("userId");
	// const { setUsers } = useUserStore();

	if (!userId) {
		return NextResponse.json({ error: "Missing userId" }, { status: 400 });
	}

	const user = await getUserStatus(userId);

	if (!user[0]) {
		return NextResponse.json({ error: "User not found" }, { status: 404 });
	}

	// setUsers(data); // Assign the zustand users for persistence

	return NextResponse.json(user[0]);
}
