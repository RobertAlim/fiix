// lib/server/monitoring-report-query.ts
//
// Backs the Monitoring report (components/pages/Monitoring.tsx) — one row
// per client+location "as of" a selected month, grouped by Area (South/
// North) and, within an Area, by Client Group (proximity clusters, see
// db/schema.ts's `clientGroups`/`clients.clientGroupId` and
// lib/server/client-groups.ts). Server-only (imports `db`) — never import
// this from a client component.
//
// Design notes (see the request this implements for full context):
//   - "No. Of Printers" replaces the originally-requested "Maintenance
//     Performed" column per an explicit correction from the requester: it's
//     simply how many printers were deployed at that client+location AS OF
//     the selected month — a printer deployed AFTER the selected month must
//     not count when looking at a past month. That's why this is computed
//     from a `deployments` snapshot (`deploymentDate <= monthEnd`), not from
//     the `activeDeployment` view (which only reflects the current moment).
//   - "Total Visits" is the count of distinct CALENDAR DAYS within the
//     selected month that a `maintain` (completed maintenance) record exists
//     for that client+location — actual completed work, never scheduled-only
//     itineraries (`schedules`/`scheduleDetails` are not touched here at all).
//   - Status is derived purely from Total Visits per the requester's rule:
//     0 -> "NO SCHEDULE", 1 -> "LOW VISIT", 2+ -> "VISITED".
//   - Manila-local day bucketing: `maintain.createdAt` is a plain
//     `timestamp` column with NO timezone info attached (unlike e.g.
//     `technicianAttendance.timeIn/timeOut`, which are `timestamptz`).
//     Postgres stores/returns it as a naive UTC instant regardless, so
//     converting it to a Manila calendar date requires the "double AT TIME
//     ZONE" idiom: interpret it as UTC, then re-render in Asia/Manila —
//     `(col AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila')::date`. The
//     reverse (a Manila-local calendar boundary back into the naive-UTC form
//     comparable to the raw column) is
//     `(boundary::timestamp AT TIME ZONE 'Asia/Manila' AT TIME ZONE 'UTC')`.
//     This mirrors the convention already established for attendance in
//     lib/attendance.ts's `phTodayDateString()`.
import { db } from "@/db";
import { sql } from "drizzle-orm";

export interface MonitoringReportParams {
	/** "YYYY-MM", always resolved (defaults to the current Philippine month
	 * when not supplied by the caller — see parseMonitoringMonth). */
	month: string;
}

export interface ParsedMonitoringMonth {
	ok: true;
	month: string;
	year: number;
	monthIndex1: number; // 1-based, e.g. 9 for September
	/** Inclusive first calendar day of the month, Manila-local, "YYYY-MM-DD". */
	monthStart: string;
	/** Inclusive last calendar day of the month, Manila-local, "YYYY-MM-DD". */
	monthEnd: string;
}
export interface MonitoringMonthError {
	ok: false;
	error: string;
}

function pad2(n: number) {
	return String(n).padStart(2, "0");
}

/** Today's date in Asia/Manila as "YYYY-MM-DD", independent of the server's
 * own timezone — same approach as lib/attendance.ts's phTodayDateString(). */
function manilaTodayDateString(): string {
	return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

/** Parses the `month` query param ("YYYY-MM"), defaulting to the current
 * Philippine month/year when omitted, and resolves the calendar-day range
 * needed for both the "as of" deployment snapshot and the visit-count
 * window. */
export function parseMonitoringMonth(
	monthParam: string | null | undefined
): ParsedMonitoringMonth | MonitoringMonthError {
	const month = monthParam?.trim() || manilaTodayDateString().slice(0, 7);
	const match = month.match(/^(\d{4})-(\d{2})$/);
	if (!match) {
		return { ok: false, error: "month must be in YYYY-MM format." };
	}
	const year = Number(match[1]);
	const monthIndex1 = Number(match[2]);
	if (monthIndex1 < 1 || monthIndex1 > 12) {
		return { ok: false, error: "month must be between 01 and 12." };
	}
	const lastDay = new Date(year, monthIndex1, 0).getDate();
	return {
		ok: true,
		month,
		year,
		monthIndex1,
		monthStart: `${year}-${pad2(monthIndex1)}-01`,
		monthEnd: `${year}-${pad2(monthIndex1)}-${pad2(lastDay)}`,
	};
}

export type MonitoringStatus = "NO SCHEDULE" | "LOW VISIT" | "VISITED";

export function statusForVisits(totalVisits: number): MonitoringStatus {
	if (totalVisits >= 2) return "VISITED";
	if (totalVisits === 1) return "LOW VISIT";
	return "NO SCHEDULE";
}

export interface MonitoringReportRow {
	clientId: number;
	clientName: string;
	area: "South" | "North";
	clientGroupId: number | null;
	clientGroupName: string | null;
	locationId: number;
	locationName: string;
	/** Printers deployed at this client+location as of the selected month's
	 * last day — excludes any printer whose deployment there started after
	 * that date, per the requester's explicit correction. */
	printerCount: number;
	/** Distinct Manila-local calendar days within the selected month that
	 * had at least one completed `maintain` record for this client+location. */
	totalVisits: number;
	/** Manila-local calendar date ("YYYY-MM-DD") of the most recent
	 * completed maintenance in the selected month, or null if none. */
	lastVisit: string | null;
	status: MonitoringStatus;
}

/**
 * One consolidated query, run as raw SQL (`db.execute`) rather than
 * Drizzle's query builder — the "as of" DISTINCT ON snapshot, the
 * Manila-local day bucketing, and the multi-CTE shape aren't practical to
 * express through the builder alone.
 *
 * CTEs:
 *   - deployments_as_of: the latest deployment row per printer with
 *     deploymentDate <= monthEnd (a true point-in-time snapshot, unlike the
 *     `activeDeployment` view which only ever reflects "now") that was still
 *     `deployedHere` at that point in its own history.
 *   - printer_counts: deployments_as_of grouped by client+location.
 *   - visits: from `maintain`, grouped by client+location, counting distinct
 *     Manila-local calendar days within [monthStart, monthEnd] and the max
 *     such day.
 *   - relevant_locations: every distinct client+location that has EVER had a
 *     deployment or a maintain record — the row universe for the report, so
 *     a location shows up with zero printers/visits rather than being
 *     silently dropped.
 */
export async function fetchMonitoringReportRows(
	parsed: ParsedMonitoringMonth
): Promise<MonitoringReportRow[]> {
	const { monthStart, monthEnd } = parsed;

	const result = await db.execute(sql`
		WITH deployments_as_of AS (
			SELECT DISTINCT ON (d."printerId")
				d."printerId", d."clientId", d."locationId", d."deployedHere"
			FROM "deployments" d
			WHERE d."deploymentDate" <= ${monthEnd}::date
			ORDER BY d."printerId", d."deploymentDate" DESC, d."id" DESC
		),
		printer_counts AS (
			SELECT "clientId", "locationId", COUNT(*)::int AS "printerCount"
			FROM deployments_as_of
			WHERE "deployedHere" = true
			GROUP BY "clientId", "locationId"
		),
		visits AS (
			SELECT
				m."clientId",
				m."locationId",
				COUNT(
					DISTINCT (m."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila')::date
				)::int AS "totalVisits",
				MAX(
					(m."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila')::date
				) AS "lastVisit"
			FROM "maintain" m
			WHERE m."locationId" IS NOT NULL
				AND m."createdAt" >= (${monthStart}::date::timestamp AT TIME ZONE 'Asia/Manila' AT TIME ZONE 'UTC')
				AND m."createdAt" < ((${monthEnd}::date + 1)::timestamp AT TIME ZONE 'Asia/Manila' AT TIME ZONE 'UTC')
			GROUP BY m."clientId", m."locationId"
		),
		relevant_locations AS (
			SELECT "clientId", "locationId" FROM deployments_as_of
			UNION
			SELECT "clientId", "locationId" FROM visits
		)
		SELECT
			c."id" AS "clientId",
			c."name" AS "clientName",
			c."area" AS "area",
			c."clientGroupId" AS "clientGroupId",
			cg."name" AS "clientGroupName",
			l."id" AS "locationId",
			l."name" AS "locationName",
			COALESCE(pc."printerCount", 0) AS "printerCount",
			COALESCE(v."totalVisits", 0) AS "totalVisits",
			v."lastVisit" AS "lastVisit"
		FROM relevant_locations rl
		INNER JOIN "clients" c ON c."id" = rl."clientId"
		INNER JOIN "locations" l ON l."id" = rl."locationId"
		LEFT JOIN "clientGroups" cg ON cg."id" = c."clientGroupId"
		LEFT JOIN printer_counts pc ON pc."clientId" = rl."clientId" AND pc."locationId" = rl."locationId"
		LEFT JOIN visits v ON v."clientId" = rl."clientId" AND v."locationId" = rl."locationId"
		WHERE c."area" IS NOT NULL
		ORDER BY c."area" ASC, cg."name" ASC NULLS LAST, c."name" ASC, l."name" ASC
	`);

	const rows = result.rows as Array<{
		clientId: number;
		clientName: string;
		area: "South" | "North";
		clientGroupId: number | null;
		clientGroupName: string | null;
		locationId: number;
		locationName: string;
		printerCount: number;
		totalVisits: number;
		lastVisit: string | null;
	}>;

	// Postgres's plain text ORDER BY above sorts group names lexicographically
	// ("SG1" < "SG10" < "SG11" < "SG2" < ...), not the numeric order a group
	// code like "SG<n>" implies — re-sorted here with a locale compare in
	// numeric mode ("SG1" < "SG2" < ... < "SG10" < "SG11"), which is what
	// actually determines both display order AND which consecutive rows
	// components/pages/Monitoring.tsx's buildGroupRuns() merges into one
	// section header, so this ordering has to be right, not just cosmetic.
	// Ungrouped clients (clientGroupName === null) keep sorting after every
	// named group, same as the SQL's own "NULLS LAST" did.
	const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
	rows.sort((a, b) => {
		if (a.area !== b.area) return a.area.localeCompare(b.area);
		if (a.clientGroupName === null && b.clientGroupName !== null) return 1;
		if (a.clientGroupName !== null && b.clientGroupName === null) return -1;
		if (a.clientGroupName !== null && b.clientGroupName !== null) {
			const cmp = collator.compare(a.clientGroupName, b.clientGroupName);
			if (cmp !== 0) return cmp;
		}
		const nameCmp = collator.compare(a.clientName, b.clientName);
		if (nameCmp !== 0) return nameCmp;
		return collator.compare(a.locationName, b.locationName);
	});

	return rows.map((r) => ({
		...r,
		status: statusForVisits(r.totalVisits),
	}));
}
