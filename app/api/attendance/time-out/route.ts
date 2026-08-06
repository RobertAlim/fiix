// app/api/attendance/time-out/route.ts
import { db } from "@/db";
import { technicianAttendance, technicianGpsStatus, users } from "@/db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/require-role";
import { sendSmsToRecipients, getActiveSmsRecipientNumbers } from "@/lib/sms";
import { formatClockTime } from "@/lib/attendance";
import { describeLastKnownLocation } from "@/lib/location-label";

export async function POST() {
	const auth = await requireRole(["Technician"]);
	if (auth.error) return auth.error;
	const technicianId = auth.user.id;

	const phToday = sql<string>`(now() AT TIME ZONE 'Asia/Manila')::date`;

	const [session] = await db
		.update(technicianAttendance)
		.set({ timeOut: new Date() })
		.where(
			and(
				eq(technicianAttendance.technicianId, technicianId),
				eq(technicianAttendance.workDate, phToday),
				// Only close an open session — a second Time Out tap becomes a
				// harmless no-op that reports the same error either way,
				// rather than silently overwriting the original timestamp.
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

	// Best-effort — a failed SMS must never fail the Time Out itself, since
	// that would strand a technician's actual attendance record over a
	// notification. Errors are logged, not surfaced to the caller.
	try {
		const [technician] = await db
			.select({ firstName: users.firstName, lastName: users.lastName })
			.from(users)
			.where(eq(users.id, technicianId))
			.limit(1);

		const numbers = await getActiveSmsRecipientNumbers();
		if (technician && numbers.length > 0) {
			// "Last known location" here is GPS Monitoring's live ping table,
			// NOT a timeOut coordinate — this table doesn't have one (only
			// timeIn is geofence-captured). A technician who has been pinging
			// all day naturally has a fresh position on file at Time Out;
			// one who never enabled GPS simply gets the coordinate-less
			// fallback message below.
			const [gps] = await db
				.select({
					latitude: technicianGpsStatus.latitude,
					longitude: technicianGpsStatus.longitude,
				})
				.from(technicianGpsStatus)
				.where(eq(technicianGpsStatus.technicianId, technicianId))
				.limit(1);

			const locationPhrase =
				gps?.latitude != null && gps?.longitude != null
					? ` near ${await describeLastKnownLocation(gps.latitude, gps.longitude)}`
					: "";

			await sendSmsToRecipients(
				numbers,
				`${technician.firstName} ${technician.lastName} has completed their shift and timed out${locationPhrase} at ${formatClockTime(session.timeOut!)}.`
			);
		}
	} catch (err) {
		console.error("time-out SMS failed:", err);
	}

	return NextResponse.json({ session });
}
