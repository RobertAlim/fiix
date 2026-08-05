// app/api/admin/users/route.ts
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { desc, inArray } from "drizzle-orm";
import { requireRole } from "@/lib/require-role";

export async function GET(req: Request) {
	const auth = await requireRole(["Admin"]);
	if (auth.error) return auth.error;

	// Optional filter, e.g. ?role=Admin,Scheduler — used by the SMS
	// Recipients picker, which should only offer roles that actually receive
	// the Time In notification (see app/api/attendance/time-in).
	const roleParam = new URL(req.url).searchParams.get("role");
	const roles = roleParam
		?.split(",")
		.map((r) => r.trim())
		.filter(Boolean);

	const rows = await db
		.select({
			id: users.id,
			firstName: users.firstName,
			lastName: users.lastName,
			email: users.email,
			role: users.role,
			contactNo: users.contactNo,
			isActive: users.isActive,
			createdAt: users.createdAt,
		})
		.from(users)
		.where(roles && roles.length > 0 ? inArray(users.role, roles) : undefined)
		.orderBy(desc(users.createdAt));

	return NextResponse.json(rows, { status: 200 });
}
