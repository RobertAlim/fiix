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
	const auth = await requireRole(["Admin"]);
	if (auth.error) return auth.error;

	const parsed = parseAttendanceReportParams(new URL(req.url).searchParams);
	if (!parsed.ok) {
		return NextResponse.json({ error: parsed.error }, { status: 400 });
	}
	const { params, rangeStart, rangeEnd } = parsed;

	const rows = await fetchAttendanceReportRows(rangeStart, rangeEnd, params.technicianId);

	return NextResponse.json({
		rows: rows.map((r) => ({
			technicianId: r.technicianId,
			technician: `${r.technicianFirstName} ${r.technicianLastName}`,
			itineraryDate: formatItineraryDate(new Date(r.workDate)),
			timeIn: formatClockTime(r.timeIn),
			timeOut: r.timeOut ? formatClockTime(r.timeOut) : "—",
			hoursRendered: r.timeOut
				? formatRenderedDuration(renderedMinutes(r.timeIn, r.timeOut))
				: "In progress",
		})),
	});
}
