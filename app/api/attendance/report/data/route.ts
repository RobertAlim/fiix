// app/api/attendance/report/data/route.ts
// JSON counterpart to the Excel export, for the Attendance Report page's
// "Generate" button — same filters, same underlying query, same formatting
// helpers, so the on-screen grid and the downloaded file always agree.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/require-role";
import {
	renderedMinutes,
	formatRenderedDuration,
	formatItineraryDate,
	formatClockTime,
} from "@/lib/attendance";
import {
	parseAttendanceReportParams,
	fetchAttendanceReportRows,
} from "@/lib/server/attendance-report-query";

export async function GET(req: Request) {
	// Admin and Super Admin can both view this report now — Admin's ability
	// to EDIT a row's Sign Out is further restricted, but that's enforced in
	// app/api/attendance/report/[id]/time-out/route.ts, not here. This route
	// only decides who can see the report at all.
	const auth = await requireRole(["Admin", "Super Admin"]);
	if (auth.error) return auth.error;

	const parsed = parseAttendanceReportParams(new URL(req.url).searchParams);
	if (!parsed.ok) {
		return NextResponse.json({ error: parsed.error }, { status: 400 });
	}
	const { params, rangeStart, rangeEnd } = parsed;

	const rows = await fetchAttendanceReportRows(
		rangeStart,
		rangeEnd,
		params.technicianId,
		params.role
	);

	return NextResponse.json({
		rows: rows.map((r) => ({
			id: r.id,
			technicianId: r.technicianId,
			technician: `${r.technicianFirstName} ${r.technicianLastName}`,
			role: r.role,
			workDate: r.workDate,
			itineraryDate: formatItineraryDate(new Date(r.workDate)),
			// Raw ISO alongside the pre-formatted display string — the Sign
			// Out edit popover needs the actual instant (to prefill its input
			// and to know whether a value exists at all), not just the
			// human-readable "—" placeholder.
			timeInIso: r.timeIn.toISOString(),
			timeOutIso: r.timeOut ? r.timeOut.toISOString() : null,
			timeIn: formatClockTime(r.timeIn),
			timeOut: r.timeOut ? formatClockTime(r.timeOut) : "—",
			hoursRendered: r.timeOut
				? formatRenderedDuration(renderedMinutes(r.timeIn, r.timeOut))
				: "In progress",
		})),
	});
}
