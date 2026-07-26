// lib/require-role.ts
import "server-only";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { Role, isValidRole } from "@/lib/permissions";

export interface AuthorizedUser {
	id: number;
	clerkId: string;
	role: Role;
}

type RequireRoleResult =
	| { user: AuthorizedUser; error?: undefined }
	| { user?: undefined; error: NextResponse };

/**
 * Verifies the caller is signed in, active, and holds one of the allowed
 * roles. Every route that belongs to a specific module (Schedule, Report,
 * Maintenance, Admin) should call this first and return `error` immediately
 * if present — this is the actual security boundary; the frontend nav only
 * hides links, it doesn't protect data.
 */
export async function requireRole(
	allowedRoles: Role[]
): Promise<RequireRoleResult> {
	const { userId } = await auth();
	if (!userId) {
		return {
			error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
		};
	}

	const [dbUser] = await db
		.select({
			id: users.id,
			clerkId: users.clerkId,
			role: users.role,
			isActive: users.isActive,
		})
		.from(users)
		.where(eq(users.clerkId, userId))
		.limit(1);

	if (!dbUser || !dbUser.isActive) {
		return {
			error: NextResponse.json(
				{ error: "Account is not active." },
				{ status: 403 }
			),
		};
	}

	if (!isValidRole(dbUser.role) || !allowedRoles.includes(dbUser.role)) {
		return {
			error: NextResponse.json(
				{ error: "You do not have permission to access this resource." },
				{ status: 403 }
			),
		};
	}

	return { user: { id: dbUser.id, clerkId: dbUser.clerkId, role: dbUser.role } };
}

/** Shorthand for routes shared across every role — just needs to be signed
 * in, active, and have a role assigned (any of the three). */
export async function requireActiveUser(): Promise<RequireRoleResult> {
	return requireRole(["Admin", "Technician", "Scheduler"]);
}
