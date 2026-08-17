// app/api/attendance/time-in/route.ts
import { db } from "@/db";
import {
	technicianAttendance,
	schedules,
	locationGeofences,
	users,
	clients,
} from "@/db/schema";
import { eq, and, asc, sql, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/require-role";
import { isWithinGeofence } from "@/lib/geofence";
import { sendSmsToRecipients, getActiveSmsRecipientNumbers } from "@/lib/sms";

const bodySchema = z.object({
	latitude: z.number().min(-90).max(90),
	longitude: z.number().min(-180).max(180),
});

export async function POST(req: Request) {
	const auth = await requireRole(["Technician"]);
	if (auth.error) return auth.error;
	const technicianId = auth.user.id;

	const parsed = bodySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "A GPS fix is required to time in." },
			{ status: 400 }
		);
	}
	const { latitude, longitude } = parsed.data;

	const phToday = sql<string>`(now() AT TIME ZONE 'Asia/Manila')::date`;

	// Re-derive the first stop and its geofence server-side rather than
	// trusting anything the client claims about which schedule or radius
	// applies — the earlier /status call is advisory UI only.
	const [firstStop] = await db
		.select({
			id: schedules.id,
			locationId: schedules.locationId,
			clientName: clients.name,
		})
		.from(schedules)
		.innerJoin(clients, eq(clients.id, schedules.clientId))
		.where(
			and(
				eq(schedules.technicianId, technicianId),
				eq(schedules.scheduledAt, phToday)
			)
		)
		.orderBy(
			sql`CASE WHEN ${schedules.sequence} IS NULL THEN 1 ELSE 0 END`,
			asc(schedules.sequence),
			asc(schedules.id)
		)
		.limit(1);

	if (!firstStop) {
		return NextResponse.json(
			{ error: "You have no scheduled visits today." },
			{ status: 409 }
		);
	}

	const [geofence] = await db
		.select()
		.from(locationGeofences)
		.where(eq(locationGeofences.locationId, firstStop.locationId))
		.limit(1);

	if (!geofence) {
		return NextResponse.json(
			{
				error:
					"This client's location has no geofence configured yet. Ask an admin to set one up before timing in.",
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
				error: `You're too far from the first client to time in. Move within ${geofence.radiusMeters}m and try again.`,
			},
			{ status: 403 }
		);
	}

	// The unique (technicianId, workDate) index is the real guard against a
	// double time-in (e.g. a racing double-tap); this check just gives a
	// friendlier message than a raw constraint-violation 500 in the common case.
	const [existing] = await db
		.select({ id: technicianAttendance.id })
		.from(technicianAttendance)
		.where(
			and(
				eq(technicianAttendance.technicianId, technicianId),
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
				technicianId,
				workDate: phToday,
				timeIn: new Date(),
				timeInLatitude: latitude,
				timeInLongitude: longitude,
				firstScheduleId: firstStop.id,
			})
			.returning();
	} catch {
		// Constraint violation from a genuine race — same friendly message.
		return NextResponse.json(
			{ error: "You have already timed in today." },
			{ status: 409 }
		);
	}

	// SMS is best-effort: a delivery failure must never undo an already
	// successful Time In, so this runs after the insert and its result never
	// changes the response status.
	//
	// The claim below is a single-flight lock, not just a "did we already
	// send" check: only the request whose UPDATE actually flips smsSentAt
	// from null goes on to call Semaphore. That makes the send exactly-once
	// for this session even if this route were somehow invoked more than
	// once for the same successful Time In — e.g. a client retry after a
	// response was lost in transit — which the unique-session insert alone
	// doesn't fully rule out for a step that happens *after* the insert.
	const [claimed] = await db
		.update(technicianAttendance)
		.set({ smsSentAt: new Date() })
		.where(
			and(eq(technicianAttendance.id, session.id), isNull(technicianAttendance.smsSentAt))
		)
		.returning({ id: technicianAttendance.id });

	let smsResult: { sent: number; failed: number } | null = null;
	if (claimed) {
		const [technician] = await db
			.select({ firstName: users.firstName, lastName: users.lastName })
			.from(users)
			.where(eq(users.id, technicianId))
			.limit(1);

		// This used to be its own inline copy of the same query
		// getActiveSmsRecipientNumbers() runs — exactly the kind of drift
		// that helper's own doc comment (lib/sms.ts) was written to
		// prevent, just never actually wired up here. Now calls the real
		// shared function, which also means the Admin/Scheduler-only role
		// filter that used to live in this inline copy is gone too: any
		// active recipient qualifies now, regardless of role.
		const numbers = await getActiveSmsRecipientNumbers();

		if (numbers.length > 0 && technician) {
			const timeStr = new Date().toLocaleTimeString("en-US", {
				timeZone: "Asia/Manila",
				hour: "2-digit",
				minute: "2-digit",
			});
			smsResult = await sendSmsToRecipients(
				numbers,
				`${technician.firstName} ${technician.lastName} has timed in at ${firstStop.clientName} at ${timeStr}.`
			);
		}
	}

	return NextResponse.json({ session, sms: smsResult }, { status: 201 });
}
