// lib/permissions.ts
// Single source of truth for RBAC: which modules each role can access.
// Used by the dashboard shell (nav filtering) and by API routes (requireRole).

export const ROLES = ["Admin", "Technician", "Scheduler"] as const;
export type Role = (typeof ROLES)[number];

export type ModuleKey =
	| "dashboard"
	| "maintenance"
	| "taskTracker"
	| "report"
	| "schedule"
	| "roleAssignment"
	| "dataImport"
	| "printers";

export const MODULE_ACCESS: Record<Role, ModuleKey[]> = {
	Admin: [
		"dashboard",
		"maintenance",
		"taskTracker",
		"report",
		"schedule",
		"roleAssignment",
		"dataImport",
		"printers",
	],
	Technician: ["dashboard", "maintenance"],
	Scheduler: ["dashboard", "taskTracker", "report", "schedule"],
};

export function isValidRole(role: string | null | undefined): role is Role {
	return !!role && (ROLES as readonly string[]).includes(role);
}

export function canAccessModule(
	role: string | null | undefined,
	module: ModuleKey
): boolean {
	if (!isValidRole(role)) return false;
	return MODULE_ACCESS[role].includes(module);
}

/** First module a role is allowed to land on — used as a safe default. */
export function defaultModuleFor(role: string | null | undefined): ModuleKey {
	if (isValidRole(role)) return MODULE_ACCESS[role][0];
	return "dashboard";
}
