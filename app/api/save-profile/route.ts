// app/api/save-profile/route.ts
import { db } from "@/db";
import { users } from "@/db/schema";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

const bodySchema = z.object({
	middleName: z.string().trim().max(20).optional().nullable(),
	birthday: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, "Birthday must be YYYY-MM-DD")
		.optional()
		.nullable(),
	contactNo: z
		.string()
		.trim()
		.regex(/^09\d{9}$/, "Invalid PH mobile number")
		.optional()
		.nullable(),
	// isActive intentionally NOT accepted here — only an Admin can activate
	// a user, via PATCH /api/admin/users/[id]. Accepting it from this route
	// would let any signed-in user self-activate.
});

export async function POST(req: NextRequest) {
	const { userId } = await auth();

	if (!userId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const parsed = bodySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "Invalid profile data", issues: parsed.error.flatten() },
			{ status: 400 }
		);
	}

	const { middleName, birthday, contactNo } = parsed.data;

	await db
		.update(users)
		.set({ middleName, birthday, contactNo })
		.where(eq(users.clerkId, userId));

	return NextResponse.json({ success: true });
}
