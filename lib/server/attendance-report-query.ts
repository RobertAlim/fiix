// lib/server/attendance-report-query.ts
// Shared between the on-screen "Generate" grid (JSON) and the "Download
// Excel" export, so the two can never drift into showing/exporting
// different rows for what looks like the same filters. Server-only (imports
// `db`) — never import this from a client component.
import { db } from "@/db";
import { technicianAttendance, users } from "@/db/schema";
import { eq, and, gte, lte, asc } from "drizzle-orm";
import { cutoffDayRange, type PayrollCutoff } from "@/lib/attendance";
import { ROLES, type Role } from "@/lib/permissions";

export interface AttendanceReportParams {
	technicianId: number | null;
	month: string; // "YYYY-MM"
	cutoff: PayrollCutoff | null;
	/** Filters to one role (e.g. only Admin Timekeep sessions) — distinct
	 * from `technicianId`, which narrows to one specific PERSON regardless
	 * of role. The two can be combined. */
	role: Role | null;
}

export interface ParsedAttendanceReportParams {
	ok: true;
	params: AttendanceReportParams;
	rangeStart: string;
	rangeEnd: string;
}
export interface AttendanceReportParamsError {
	ok: false;
	error: string;
}

function pad2(n: number) {
	return String(n).padStart(2, "0");
}

/** Parses and validates the query-string filters both report routes
 * accept, returning the resolved [start, end] date range alongside them. */
export function parseAttendanceReportParams(
	searchParams: URLSearchParams
): ParsedAttendanceReportParams | AttendanceReportParamsError {
	const technicianIdParam = searchParams.get("technicianId");
	const monthParam = searchParams.get("month");
	const cutoffParam = searchParams.get("cutoff");
	const roleParam = searchParams.get("role");

	const monthMatch = monthParam?.match(/^(\d{4})-(\d{2})$/);
	if (!monthMatch) {
		return { ok: false, error: "month is required, in YYYY-MM format." };
	}
	const year = Number(monthMatch[1]);
	const monthIndex0 = Number(monthMatch[2]) - 1;

	if (cutoffParam && cutoffParam !== "A" && cutoffParam !== "B") {
		return { ok: false, error: 'cutoff must be "A" or "B" when provided.' };
	}
	const cutoff = (cutoffParam as PayrollCutoff | null) ?? null;

	const technicianId = technicianIdParam ? Number(technicianIdParam) : null;
	if (technicianIdParam && (!technicianId || technicianId <= 0)) {
		return { ok: false, error: "Invalid technicianId." };
	}

	let role: Role | null = null;
	if (roleParam) {
		if (!(ROLES as readonly string[]).includes(roleParam)) {
			return { ok: false, error: "Invalid role." };
		}
		role = roleParam as Role;
	}

	const { start: startDay, end: endDay } = cutoff
		? cutoffDayRange(year, monthIndex0, cutoff)
		: { start: 1, end: new Date(year, monthIndex0 + 1, 0).getDate() };

	const rangeStart = `${year}-${pad2(monthIndex0 + 1)}-${pad2(startDay)}`;
	const rangeEnd = `${year}-${pad2(monthIndex0 + 1)}-${pad2(endDay)}`;

	return {
		ok: true,
		params: { technicianId, month: monthParam!, cutoff, role },
		rangeStart,
		rangeEnd,
	};
}

export interface AttendanceReportRow {
	technicianId: number;
	technicianFirstName: string;
	technicianLastName: string;
	/** The person's CURRENT role. A person's role can change after the
	 * attendance row was recorded (e.g. promoted from Technician to
	 * Admin) — this reflects who they are now, not who they were on that
	 * date, same as `technician` (their name) already does. */
	role: string | null;
	workDate: string;
	timeIn: Date;
	timeOut: Date | null;
}

export async function fetchAttendanceReportRows(
	rangeStart: string,
	rangeEnd: string,
	technicianId: number | null,
	role: Role | null = null
): Promise<AttendanceReportRow[]> {
	const conditions = [
		gte(technicianAttendance.workDate, rangeStart),
		lte(technicianAttendance.workDate, rangeEnd),
	];
	if (technicianId) conditions.push(eq(technicianAttendance.technicianId, technicianId));
	if (role) conditions.push(eq(users.role, role));

	return db
		.select({
			technicianId: technicianAttendance.technicianId,
			technicianFirstName: users.firstName,
			technicianLastName: users.lastName,
			role: users.role,
			workDate: technicianAttendance.workDate,
			timeIn: technicianAttendance.timeIn,
			timeOut: technicianAttendance.timeOut,
		})
		.from(technicianAttendance)
		.innerJoin(users, eq(users.id, technicianAttendance.technicianId))
		.where(and(...conditions))
		.orderBy(asc(users.lastName), asc(technicianAttendance.workDate));
}
