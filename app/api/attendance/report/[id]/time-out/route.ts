// app/api/attendance/report/[id]/time-out/route.ts
//
// Lets Admin and Super Admin correct the Sign Out (Time Out) value on one
// attendance record from the Attendance Report page. This is the ONLY
// field either role may edit here — everything else on the report (name,
// role, Sign In, itinerary date) stays computed/read-only.
//
// Role rules (mirrored in the UI at components/pages/AttendanceReport.tsx,
// but THIS route is the actual boundary — the frontend check is only ever
// a courtesy and must never be trusted on its own):
//   - Super Admin may edit any record, for any role, whether the current
//     Sign Out is blank or already populated.
//   - Admin may edit ONLY a Technician's record (never another Admin's,
//     never a Super Admin's, never their own — Admin accounts don't record
//     attendance as Technicians do, but the role check below is what
//     actually enforces "not the same level or higher" regardless), and
//     ONLY when a Sign Out value is already present. An Admin can correct
//     an existing value but can't be the one to invent one from blank —
//     that's treated as a bigger change than a correction.
import { NextResponse } from "next/server";
import { db } from "@/db";
import { technicianAttendance, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { fromZonedTime } from "date-fns-tz";
import { requireRole } from "@/lib/require-role";
import {
	renderedMinutes,
	formatRenderedDuration,
	formatClockTime,
} from "@/lib/attendance";

const bodySchema = z.object({
	// 24-hour "HH:mm" from an <input type="time">, interpreted in the
	// record's own workDate, Asia/Manila local time — same timezone
	// convention as the rest of the attendance system (phTodayDateString,
	// the report's own display formatting, etc.).
	time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "time must be HH:mm"),
});

export async function PATCH(
	req: Request,
	{ params }: { params: Promise<{ id: string }> }
) {
	const authResult = await requireRole(["Admin", "Super Admin"]);
	if (authResult.error) return authResult.error;
	const actingUser = authResult.user;

	const { id: idParam } = await params;
	const id = Number(idParam);
	if (!Number.isInteger(id) || id <= 0) {
		return NextResponse.json({ error: "Invalid attendance record id." }, { status: 400 });
	}

	const parsed = bodySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "Invalid request", issues: parsed.error.flatten() },
			{ status: 400 }
		);
	}
	const { time } = parsed.data;

	const [row] = await db
		.select({
			id: technicianAttendance.id,
			workDate: technicianAttendance.workDate,
			timeIn: technicianAttendance.timeIn,
			timeOut: technicianAttendance.timeOut,
			targetRole: users.role,
		})
		.from(technicianAttendance)
		.innerJoin(users, eq(users.id, technicianAttendance.technicianId))
		.where(eq(technicianAttendance.id, id))
		.limit(1);

	if (!row) {
		return NextResponse.json({ error: "Attendance record not found." }, { status: 404 });
	}

	// Exact role, not effectiveRoles() — Super Admin's unrestricted access
	// below must come from actually holding the role, not from the
	// "Super Admin implies Admin" implication used elsewhere for the
	// opposite direction (letting a Super Admin pass an Admin-only check).
	const isSuperAdmin = actingUser.role === "Super Admin";

	if (!isSuperAdmin) {
		// Admin: may only edit a Technician's record — never another Admin's
		// or a Super Admin's, i.e. never anyone at the same level or above.
		if (row.targetRole !== "Technician") {
			return NextResponse.json(
				{
					error:
						"Admins may only edit Sign Out for Technician attendance records.",
				},
				{ status: 403 }
			);
		}

		// Admin may only correct an EXISTING Sign Out — not create one from
		// blank. Blank means the technician hasn't signed out yet (or the
		// session is still open); that's a bigger call reserved for Super
		// Admin.
		if (!row.timeOut) {
			return NextResponse.json(
				{
					error:
						"This record has no Sign Out value yet. Only Super Admin can set one from blank.",
				},
				{ status: 403 }
			);
		}
	}

	// workDate is a plain YYYY-MM-DD `date` column; combined with the
	// submitted HH:mm and interpreted as Asia/Manila local time, then
	// converted to the UTC instant actually stored — same direction as
	// (and complementary to) convertToPhilippineTimezone in
	// lib/dateConverter.ts, which only goes UTC -> Manila-formatted-string
	// for display and has no reverse. date-fns-tz's fromZonedTime is that
	// reverse: "this wall-clock time, in this zone" -> the correct instant.
	const newTimeOut = fromZonedTime(`${row.workDate} ${time}:00`, "Asia/Manila");

	if (Number.isNaN(newTimeOut.getTime())) {
		return NextResponse.json({ error: "Could not parse the submitted time." }, { status: 400 });
	}
	if (newTimeOut <= row.timeIn) {
		return NextResponse.json(
			{ error: "Sign Out must be after Sign In." },
			{ status: 400 }
		);
	}

	const [updated] = await db
		.update(technicianAttendance)
		.set({ timeOut: newTimeOut })
		.where(eq(technicianAttendance.id, id))
		.returning({ timeOut: technicianAttendance.timeOut });

	const timeOut = updated.timeOut!;

	return NextResponse.json({
		id: row.id,
		timeOutIso: timeOut.toISOString(),
		timeOut: formatClockTime(timeOut),
		hoursRendered: formatRenderedDuration(renderedMinutes(row.timeIn, timeOut)),
	});
}
