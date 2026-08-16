// lib/require-role.ts
import "server-only";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { Role, isValidRole, effectiveRoles } from "@/lib/permissions";

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
 *
 * Role implication (see lib/permissions.ts) is applied here: a Super Admin
 * passes any check written for an Admin, so existing `requireRole(["Admin"])`
 * call sites did not need editing when the Super Admin role was introduced.
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

	if (!isValidRole(dbUser.role)) {
		return {
			error: NextResponse.json(
				{ error: "You do not have permission to access this resource." },
				{ status: 403 }
			),
		};
	}

	const holds = effectiveRoles(dbUser.role);
	if (!allowedRoles.some((allowed) => holds.includes(allowed))) {
		return {
			error: NextResponse.json(
				{ error: "You do not have permission to access this resource." },
				{ status: 403 }
			),
		};
	}

	return { user: { id: dbUser.id, clerkId: dbUser.clerkId, role: dbUser.role } };
}

// --- Super Admin bootstrap -------------------------------------------------
//
// The chicken-and-egg problem this solves: Role Assignment is a Super Admin
// module, but the very first Super Admin has to be created THROUGH Role
// Assignment. A fresh deployment where nobody holds the role yet would
// otherwise have no way to grant it without hand-written SQL against
// production.
//
// So: while ZERO Super Admin accounts exist, an Admin is allowed into the
// Super-Admin-only modules. The moment the first Super Admin is created,
// this fallback closes by itself and the rule collapses to exactly what
// was specified — no manual step, and no window where the system is
// unadministrable.
const SUPER_ADMIN_CACHE_MS = 60_000;
let superAdminCache: { value: boolean; at: number } | null = null;

/** Whether at least one ACTIVE Super Admin account exists. Memoized briefly
 * — this is consulted on every Super-Admin-gated request, and the answer
 * changes at most a handful of times in the system's lifetime. */
export async function superAdminExists(): Promise<boolean> {
	const now = Date.now();
	if (superAdminCache && now - superAdminCache.at < SUPER_ADMIN_CACHE_MS) {
		return superAdminCache.value;
	}
	const [row] = await db
		.select({ id: users.id })
		.from(users)
		.where(and(eq(users.role, "Super Admin"), eq(users.isActive, true)))
		.limit(1);

	const value = !!row;
	superAdminCache = { value, at: now };
	return value;
}

/** Clears the memo — called right after a role change so the very Admin who
 * just promoted themselves doesn't keep the bootstrap grace for another
 * minute (or lose it a minute late). */
export function invalidateSuperAdminCache(): void {
	superAdminCache = null;
}

/**
 * Gate for the Super-Admin-only modules (Role Assignment, SMS Recipients,
 * Attendance Report, Purge Maintenance, Staff GPS Location). Falls back to
 * allowing an Admin while no Super Admin exists yet — see above.
 */
export async function requireSuperAdmin(): Promise<RequireRoleResult> {
	const result = await requireRole(["Super Admin", "Admin"]);
	if (result.error) return result;

	if (result.user.role === "Super Admin") return result;

	// Admin: only allowed through during bootstrap.
	if (!(await superAdminExists())) return result;

	return {
		error: NextResponse.json(
			{ error: "This section is restricted to Super Admin accounts." },
			{ status: 403 }
		),
	};
}

/** Shorthand for routes shared across every role — just needs to be signed
 * in, active, and have a role assigned. */
export async function requireActiveUser(): Promise<RequireRoleResult> {
	return requireRole(["Super Admin", "Admin", "Technician", "Scheduler"]);
}
