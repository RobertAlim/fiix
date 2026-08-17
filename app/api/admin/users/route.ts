// app/api/admin/users/route.ts
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { desc, inArray } from "drizzle-orm";
import { requireSuperAdmin } from "@/lib/require-role";

export async function GET(req: Request) {
	// Both consumers of this route (Role Assignment, SMS Recipients) are
	// Super-Admin-only modules — see lib/permissions.ts's
	// SUPER_ADMIN_ONLY_MODULES — so the API is gated the same way, with
	// the bootstrap fallback that lets an Admin through until the first
	// Super Admin exists.
	const auth = await requireSuperAdmin();
	if (auth.error) return auth.error;

	// Optional filter, e.g. ?role=Admin,Scheduler — still used by Role
	// Assignment's own filtering needs, if any. SMS Recipients now calls
	// this WITHOUT a role param (any user can be a recipient — see
	// lib/sms.ts's getActiveSmsRecipientNumbers, which decides who
	// actually gets texted by Active status alone, not role).
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
