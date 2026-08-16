// app/api/attendance/staff/time-out/route.ts
//
// Unlike the Technician Time Out route (no geofence — a technician can end
// their shift wherever their last stop happened to be), the spec requires
// Admin/Scheduler staff to be within their configured GPS location for BOTH
// Time In and Time Out, so this route re-validates the same pin.
import { db } from "@/db";
import { technicianAttendance, staffGpsLocations } from "@/db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/require-role";
import { isWithinGeofence } from "@/lib/geofence";

const bodySchema = z.object({
	latitude: z.number().min(-90).max(90),
	longitude: z.number().min(-180).max(180),
});

export async function POST(req: Request) {
	const auth = await requireRole(["Admin", "Scheduler"]);
	if (auth.error) return auth.error;
	const userId = auth.user.id;

	const parsed = bodySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "A GPS fix is required to time out." },
			{ status: 400 }
		);
	}
	const { latitude, longitude } = parsed.data;

	const [geofence] = await db
		.select()
		.from(staffGpsLocations)
		.where(eq(staffGpsLocations.userId, userId))
		.limit(1);

	if (!geofence) {
		return NextResponse.json(
			{
				error:
					"No GPS location has been configured for your account yet. Ask a Super Admin to set one up under Staff GPS Location.",
			},
			{ status: 409 }
		);
	}

	if (
		!isWithinGeofence(
			latitude,
			longitude,
			geofence.latitude,
			geofence.longitude,
			geofence.radiusMeters
		)
	) {
		return NextResponse.json(
			{
				error: `You're too far from ${geofence.label} to time out. Move within ${geofence.radiusMeters}m and try again.`,
			},
			{ status: 403 }
		);
	}

	const phToday = sql<string>`(now() AT TIME ZONE 'Asia/Manila')::date`;

	const [session] = await db
		.update(technicianAttendance)
		.set({ timeOut: new Date() })
		.where(
			and(
				eq(technicianAttendance.technicianId, userId),
				eq(technicianAttendance.workDate, phToday),
				isNull(technicianAttendance.timeOut)
			)
		)
		.returning();

	if (!session) {
		return NextResponse.json(
			{ error: "No open session to time out of. Time in first." },
			{ status: 409 }
		);
	}

	return NextResponse.json({ session });
}
