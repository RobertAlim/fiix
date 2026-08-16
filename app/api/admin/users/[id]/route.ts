// app/api/admin/users/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireSuperAdmin, invalidateSuperAdminCache } from "@/lib/require-role";
import { ROLES } from "@/lib/permissions";

const bodySchema = z.object({
	role: z.enum(ROLES).optional(),
	isActive: z.boolean().optional(),
});

export async function PATCH(
	req: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	const auth = await requireSuperAdmin();
	if (auth.error) return auth.error;

	const { id } = await params;
	const targetId = Number(id);
	if (!Number.isInteger(targetId) || targetId <= 0) {
		return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
	}

	const parsed = bodySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success || Object.keys(parsed.data).length === 0) {
		return NextResponse.json(
			{ error: "Provide at least one of: role, isActive" },
			{ status: 400 }
		);
	}

	// Activating a user without a role leaves them signed in with nothing to
	// see, so require a role to already be set (or be included in this same
	// request) before flipping isActive on.
	if (parsed.data.isActive === true && !parsed.data.role) {
		const [existing] = await db
			.select({ role: users.role })
			.from(users)
			.where(eq(users.id, targetId))
			.limit(1);
		if (!existing?.role) {
			return NextResponse.json(
				{ error: "Assign a role before activating this user." },
				{ status: 400 }
			);
		}
	}

	const [updated] = await db
		.update(users)
		.set(parsed.data)
		.where(eq(users.id, targetId))
		.returning({
			id: users.id,
			role: users.role,
			isActive: users.isActive,
		});

	if (!updated) {
		return NextResponse.json({ error: "User not found" }, { status: 404 });
	}

	// The bootstrap fallback in requireSuperAdmin() memoizes "does a Super
	// Admin exist" for up to a minute — clear it immediately on any role
	// change so promoting (or demoting) the first Super Admin takes effect
	// on their very next request, not up to 60s late.
	if (parsed.data.role !== undefined) {
		invalidateSuperAdminCache();
	}

	return NextResponse.json(updated, { status: 200 });
}
