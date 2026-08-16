// app/api/bootstrap-status/route.ts
//
// Tells an Admin whether any Super Admin account exists yet — the frontend
// counterpart to the bootstrap fallback in lib/require-role.ts's
// requireSuperAdmin(). That fallback already lets an Admin's requests
// through to the Super-Admin-only API routes while the system has zero
// Super Admins, but the sidebar nav filtering (lib/permissions.ts's
// canAccessModule) has no way to know that on its own — it's a pure,
// synchronous function with no DB access. This is the one small async
// call the dashboard shell makes (Admin role only) to unlock the Role
// Assignment nav link during bootstrap, so an Admin can actually reach the
// screen the backend already lets them into.
import { NextResponse } from "next/server";
import { requireRole, superAdminExists } from "@/lib/require-role";

export async function GET() {
	const auth = await requireRole(["Super Admin", "Admin"]);
	if (auth.error) return auth.error;

	return NextResponse.json({ superAdminExists: await superAdminExists() });
}
