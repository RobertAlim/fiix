// lib/permissions.ts
// Single source of truth for RBAC: which modules each role can access.
// Used by the dashboard shell (nav filtering) and by API routes (requireRole).

export const ROLES = [
	"Super Admin",
	"Admin",
	"Technician",
	"Scheduler",
] as const;
export type Role = (typeof ROLES)[number];

/**
 * Role implication. A Super Admin satisfies every check written for an
 * Admin, so the ~60 existing `requireRole(["Admin"])` call sites across the
 * API did NOT each have to grow a second entry — one rule here covers them
 * all, and there's no risk of one route being missed and silently locking
 * the Super Admin out of part of the app.
 */
const ROLE_IMPLIES: Record<Role, Role[]> = {
	"Super Admin": ["Admin"],
	Admin: [],
	Technician: [],
	Scheduler: [],
};

/** Every role the given role counts as, including itself. */
export function effectiveRoles(role: Role): Role[] {
	return [role, ...ROLE_IMPLIES[role]];
}

export type ModuleKey =
	| "dashboard"
	| "maintenance"
	| "taskTracker"
	| "report"
	| "schedule"
	| "pendingMaintenance"
	| "relatedIssues"
	| "timekeep"
	| "roleAssignment"
	| "dataImport"
	| "printers"
	| "locationGeofences"
	| "staffGpsLocations"
	| "smsRecipients"
	| "attendanceReport"
	| "purgeMaintenance"
	| "gpsMonitoring";

/**
 * Modules only a Super Admin may open. Admin keeps the regular operational
 * application; anything that changes who can use the system, who gets
 * notified, or that rewrites historical/payroll data is reserved.
 */
export const SUPER_ADMIN_ONLY_MODULES: ModuleKey[] = [
	"roleAssignment",
	"smsRecipients",
	"purgeMaintenance",
	"staffGpsLocations",
];

const ADMIN_MODULES: ModuleKey[] = [
	"dashboard",
	"maintenance",
	"taskTracker",
	"report",
	"schedule",
	"pendingMaintenance",
	"relatedIssues",
	"timekeep",
	"dataImport",
	"printers",
	"locationGeofences",
	"gpsMonitoring",
	// Attendance Report is now shared: Admin can view it and edit the Sign
	// Out value within the restrictions enforced server-side in
	// app/api/attendance/report/[id]/time-out/route.ts; Super Admin keeps
	// the unrestricted version. Moved out of SUPER_ADMIN_ONLY_MODULES so
	// both the nav link and the underlying routes are reachable for Admin.
	"attendanceReport",
];

export const MODULE_ACCESS: Record<Role, ModuleKey[]> = {
	"Super Admin": [...ADMIN_MODULES, ...SUPER_ADMIN_ONLY_MODULES],
	Admin: ADMIN_MODULES,
	// Technicians no longer use the web application at all — they work in
	// the Fiix Technician mobile app. Their pages, routes and API handlers
	// are all still present and still authorize the Technician role (the
	// mobile app calls the very same API); only the WEB SHELL is closed to
	// them. See components/TechnicianWebNotice.tsx and the guard in
	// app/(root)/dashboard/page.tsx.
	Technician: [],
	Scheduler: [
		"dashboard",
		"taskTracker",
		"report",
		"schedule",
		"pendingMaintenance",
		"relatedIssues",
		"timekeep",
	],
};

export function isValidRole(role: string | null | undefined): role is Role {
	return !!role && (ROLES as readonly string[]).includes(role);
}

/** True when this role is barred from the web UI entirely (mobile-only). */
export function isWebBlockedRole(role: string | null | undefined): boolean {
	return role === "Technician";
}

export function canAccessModule(
	role: string | null | undefined,
	module: ModuleKey,
	options?: {
		/**
		 * True while zero Super Admin accounts exist yet — mirrors
		 * requireSuperAdmin()'s server-side bootstrap fallback (see
		 * lib/require-role.ts) so an Admin can actually SEE and reach the
		 * Super-Admin-only nav links (Role Assignment, etc.) during that
		 * window, instead of the backend allowing the request but the
		 * frontend never rendering a way to make it. Always omit/leave
		 * false once the caller doesn't know or care — the module stays
		 * exactly as restricted as it already was.
		 */
		superAdminBootstrapping?: boolean;
	}
): boolean {
	if (!isValidRole(role)) return false;
	if (MODULE_ACCESS[role].includes(module)) return true;
	if (
		options?.superAdminBootstrapping &&
		role === "Admin" &&
		SUPER_ADMIN_ONLY_MODULES.includes(module)
	) {
		return true;
	}
	return false;
}

/** First module a role is allowed to land on — used as a safe default. */
export function defaultModuleFor(role: string | null | undefined): ModuleKey {
	if (isValidRole(role) && MODULE_ACCESS[role].length > 0) {
		return MODULE_ACCESS[role][0];
	}
	return "dashboard";
}
