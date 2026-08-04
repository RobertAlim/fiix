// app/api/attendance/report/route.ts
// Downloadable Excel (.xlsx) of technician time logs, filtered by
// technician, month, and payroll cutoff (A: 1–15, B: 16–end of month).
import { db } from "@/db";
import { technicianAttendance, users } from "@/db/schema";
import { eq, and, gte, lte, asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/require-role";
import ExcelJS from "exceljs";
import {
	cutoffDayRange,
	renderedMinutes,
	formatRenderedDuration,
	formatItineraryDate,
	formatClockTime,
	type PayrollCutoff,
} from "@/lib/attendance";

function pad2(n: number) {
	return String(n).padStart(2, "0");
}

export async function GET(req: Request) {
	// Payroll data — restricted to Admin, unlike the operational reports
	// elsewhere in the app that Scheduler can also pull.
	const auth = await requireRole(["Admin"]);
	if (auth.error) return auth.error;

	const params = new URL(req.url).searchParams;
	const technicianIdParam = params.get("technicianId");
	const monthParam = params.get("month"); // "YYYY-MM"
	const cutoffParam = params.get("cutoff"); // "A" | "B" | null (whole month)

	const monthMatch = monthParam?.match(/^(\d{4})-(\d{2})$/);
	if (!monthMatch) {
		return NextResponse.json(
			{ error: "month is required, in YYYY-MM format." },
			{ status: 400 }
		);
	}
	const year = Number(monthMatch[1]);
	const monthIndex0 = Number(monthMatch[2]) - 1;

	if (cutoffParam && cutoffParam !== "A" && cutoffParam !== "B") {
		return NextResponse.json(
			{ error: 'cutoff must be "A" or "B" when provided.' },
			{ status: 400 }
		);
	}
	const cutoff = (cutoffParam as PayrollCutoff | null) ?? null;

	const { start: startDay, end: endDay } = cutoff
		? cutoffDayRange(year, monthIndex0, cutoff)
		: { start: 1, end: new Date(year, monthIndex0 + 1, 0).getDate() };

	const rangeStart = `${year}-${pad2(monthIndex0 + 1)}-${pad2(startDay)}`;
	const rangeEnd = `${year}-${pad2(monthIndex0 + 1)}-${pad2(endDay)}`;

	const technicianId = technicianIdParam ? Number(technicianIdParam) : null;
	if (technicianIdParam && (!technicianId || technicianId <= 0)) {
		return NextResponse.json({ error: "Invalid technicianId." }, { status: 400 });
	}

	const conditions = [
		gte(technicianAttendance.workDate, rangeStart),
		lte(technicianAttendance.workDate, rangeEnd),
	];
	if (technicianId) conditions.push(eq(technicianAttendance.technicianId, technicianId));

	const rows = await db
		.select({
			technicianFirstName: users.firstName,
			technicianLastName: users.lastName,
			workDate: technicianAttendance.workDate,
			timeIn: technicianAttendance.timeIn,
			timeOut: technicianAttendance.timeOut,
		})
		.from(technicianAttendance)
		.innerJoin(users, eq(users.id, technicianAttendance.technicianId))
		.where(and(...conditions))
		.orderBy(asc(users.lastName), asc(technicianAttendance.workDate));

	const workbook = new ExcelJS.Workbook();
	workbook.creator = "Fiix";
	workbook.created = new Date();

	const sheet = workbook.addWorksheet("Attendance");
	sheet.columns = [
		{ header: "Technician", key: "technician", width: 24 },
		{ header: "Itinerary Date", key: "itineraryDate", width: 28 },
		{ header: "Time In", key: "timeIn", width: 14 },
		{ header: "Time Out", key: "timeOut", width: 14 },
		{ header: "Hours Rendered", key: "hoursRendered", width: 18 },
	];
	sheet.getRow(1).font = { bold: true };

	for (const r of rows) {
		sheet.addRow({
			technician: `${r.technicianFirstName} ${r.technicianLastName}`,
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

	const cutoffLabel = cutoff ? `_cutoff-${cutoff}` : "";
	const filename = `attendance_${monthParam}${cutoffLabel}.xlsx`;

	return new NextResponse(buffer, {
		status: 200,
		headers: {
			"Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			"Content-Disposition": `attachment; filename="${filename}"`,
		},
	});
}
