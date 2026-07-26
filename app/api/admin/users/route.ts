// app/api/admin/users/route.ts
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { desc } from "drizzle-orm";
import { requireRole } from "@/lib/require-role";

export async function GET() {
	const auth = await requireRole(["Admin"]);
	if (auth.error) return auth.error;

	const rows = await db
		.select({
			id: users.id,
			firstName: users.firstName,
			lastName: users.lastName,
			email: users.email,
			role: users.role,
			isActive: users.isActive,
			createdAt: users.createdAt,
		})
		.from(users)
		.orderBy(desc(users.createdAt));

	return NextResponse.json(rows, { status: 200 });
}
