// app/api/save-profile/route.ts
import { db } from "@/db"; // your Drizzle setup
import { users } from "@/db/schema"; // your table schema
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
	const { userId } = await auth();

	if (!userId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { middleName, birthday, contactNo, isActive } = await req.json();

	await db
		.update(users)
		.set({ middleName, birthday, contactNo, isActive })
		.where(eq(users.clerkId, userId));

	return NextResponse.json({ success: true });
}
