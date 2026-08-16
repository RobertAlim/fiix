// app/api/attendance/staff/status/route.ts
//
// Everything the Timekeep screen needs for an Admin/Scheduler: today's
// session (if any) and the GPS pin they must be within range of. Deliberately
// separate from /api/attendance/status (the Technician version) rather than
// branching that route by role — the Technician flow derives its geofence
// from the day's FIRST SCHEDULED STOP, which has no meaning for office staff
// who aren't scheduled to client sites; this one derives it from
// staffGpsLocations instead. Both write to the SAME technicianAttendance
// table (see that table's doc comment — it was never actually
// Technician-specific, just named that way), which is what lets Admin/
// Scheduler sessions show up in the existing Attendance Report for free.
import { db } from "@/db";
import { technicianAttendance, staffGpsLocations } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/require-role";

export async function GET() {
	const auth = await requireRole(["Admin", "Scheduler"]);
	if (auth.error) return auth.error;
	const userId = auth.user.id;

	const phToday = sql<string>`(now() AT TIME ZONE 'Asia/Manila')::date`;

	const [session] = await db
		.select({
			id: technicianAttendance.id,
			timeIn: technicianAttendance.timeIn,
			timeOut: technicianAttendance.timeOut,
		})
		.from(technicianAttendance)
		.where(
			and(
				eq(technicianAttendance.technicianId, userId),
				eq(technicianAttendance.workDate, phToday)
			)
		)
		.limit(1);

	const [geofence] = await db
		.select({
			label: staffGpsLocations.label,
			latitude: staffGpsLocations.latitude,
			longitude: staffGpsLocations.longitude,
			radiusMeters: staffGpsLocations.radiusMeters,
		})
		.from(staffGpsLocations)
		.where(eq(staffGpsLocations.userId, userId))
		.limit(1);

	return NextResponse.json({
		session: session ?? null,
		// Null means "a Super Admin hasn't configured a GPS pin for this
		// account yet" — the client treats that as a setup gap, same as
		// the Technician flow's "no geofence configured" case.
		geofence: geofence ?? null,
	});
}
