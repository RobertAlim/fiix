// app/api/attendance/report/route.ts
// Downloadable Excel (.xlsx) of technician time logs, filtered by
// technician, month, and payroll cutoff (A: 1–15, B: 16–end of month).
// Query logic lives in lib/server/attendance-report-query.ts, shared with
// the JSON route the on-screen "Generate" grid uses — the two must never
// disagree about what a given set of filters returns.
import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/require-role";
import ExcelJS from "exceljs";
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
	// Payroll data — restricted to Admin, unlike the operational reports
	// elsewhere in the app that Scheduler can also pull.
	const auth = await requireSuperAdmin();
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

	const workbook = new ExcelJS.Workbook();
	workbook.creator = "Fiix";
	workbook.created = new Date();

	const sheet = workbook.addWorksheet("Attendance");
	sheet.columns = [
		{ header: "Name", key: "technician", width: 24 },
		{ header: "Role", key: "role", width: 14 },
		{ header: "Itinerary Date", key: "itineraryDate", width: 28 },
		{ header: "Time In", key: "timeIn", width: 14 },
		{ header: "Time Out", key: "timeOut", width: 14 },
		{ header: "Hours Rendered", key: "hoursRendered", width: 18 },
	];
	sheet.getRow(1).font = { bold: true };

	for (const r of rows) {
		sheet.addRow({
			technician: `${r.technicianFirstName} ${r.technicianLastName}`,
			role: r.role ?? "—",
			itineraryDate: formatItineraryDate(new Date(r.workDate)),
			timeIn: formatClockTime(r.timeIn),
			// An open session (no Time Out yet) is shown as such rather than
			// left blank, which could otherwise read as a missing/bad record
			// on a report someone is using to run payroll.
			timeOut: r.timeOut ? formatClockTime(r.timeOut) : "—",
			hoursRendered: r.timeOut
				? formatRenderedDuration(renderedMinutes(r.timeIn, r.timeOut))
				: "In progress",
		});
	}

	const buffer = await workbook.xlsx.writeBuffer();

	const cutoffLabel = params.cutoff ? `_cutoff-${params.cutoff}` : "";
	const filename = `attendance_${params.month}${cutoffLabel}.xlsx`;

	return new NextResponse(buffer, {
		status: 200,
		headers: {
			"Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			"Content-Disposition": `attachment; filename="${filename}"`,
		},
	});
}
