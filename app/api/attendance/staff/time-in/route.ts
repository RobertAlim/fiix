// app/api/attendance/staff/time-in/route.ts
import { db } from "@/db";
import { technicianAttendance, staffGpsLocations } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
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
			{ error: "A GPS fix is required to time in." },
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
				error: `You're too far from ${geofence.label} to time in. Move within ${geofence.radiusMeters}m and try again.`,
			},
			{ status: 403 }
		);
	}

	const phToday = sql<string>`(now() AT TIME ZONE 'Asia/Manila')::date`;

	// Same guard as the Technician time-in route: the real protection is
	// the unique (technicianId, workDate) index on technicianAttendance —
	// this is just a friendlier message for the common case.
	const [existing] = await db
		.select({ id: technicianAttendance.id })
		.from(technicianAttendance)
		.where(
			and(
				eq(technicianAttendance.technicianId, userId),
				eq(technicianAttendance.workDate, phToday)
			)
		)
		.limit(1);
	if (existing) {
		return NextResponse.json(
			{ error: "You have already timed in today." },
			{ status: 409 }
		);
	}

	let session;
	try {
		[session] = await db
			.insert(technicianAttendance)
			.values({
				technicianId: userId,
				workDate: phToday,
				timeIn: new Date(),
				timeInLatitude: latitude,
				timeInLongitude: longitude,
				// No itinerary applies to office staff — this column exists
				// for the Technician flow's audit trail only.
				firstScheduleId: null,
			})
			.returning();
	} catch {
		return NextResponse.json(
			{ error: "You have already timed in today." },
			{ status: 409 }
		);
	}

	return NextResponse.json({ session }, { status: 201 });
}
