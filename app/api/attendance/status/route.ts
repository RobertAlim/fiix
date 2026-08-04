// app/api/attendance/status/route.ts
// Everything the Time In screen needs in one call: whether the technician
// already has an open (or closed) session today, today's itinerary in
// sequence order, and the geofence for whichever stop is first — so the
// client can decide button state without a second round trip.
import { db } from "@/db";
import {
	technicianAttendance,
	schedules,
	clients,
	locations,
	locationGeofences,
} from "@/db/schema";
import { eq, and, asc, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/require-role";

export async function GET() {
	const auth = await requireRole(["Technician"]);
	if (auth.error) return auth.error;
	const technicianId = auth.user.id;

	const phToday = sql<string>`(now() AT TIME ZONE 'Asia/Manila')::date`;
	const phTomorrow = sql<string>`((now() AT TIME ZONE 'Asia/Manila')::date + 1)`;

	const [session] = await db
		.select({
			id: technicianAttendance.id,
			timeIn: technicianAttendance.timeIn,
			timeOut: technicianAttendance.timeOut,
		})
		.from(technicianAttendance)
		.where(
			and(
				eq(technicianAttendance.technicianId, technicianId),
				eq(technicianAttendance.workDate, phToday)
			)
		)
		.limit(1);

	const itinerary = await db
		.select({
			id: schedules.id,
			clientId: schedules.clientId,
			client: clients.name,
			locationId: schedules.locationId,
			location: locations.name,
			sequence: schedules.sequence,
			notes: schedules.notes,
		})
		.from(schedules)
		.innerJoin(clients, eq(clients.id, schedules.clientId))
		.innerJoin(locations, eq(locations.id, schedules.locationId))
		.where(
			and(
				eq(schedules.technicianId, technicianId),
				eq(schedules.scheduledAt, phToday)
			)
		)
		// Sequenced stops first (ascending), unsequenced after by id — same
		// ordering rule as the main schedule listing, kept consistent so the
		// Time In screen and the itinerary the technician sees after Time In
		// never disagree about what "first" means.
		.orderBy(
			sql`CASE WHEN ${schedules.sequence} IS NULL THEN 1 ELSE 0 END`,
			asc(schedules.sequence),
			asc(schedules.id)
		);

	const first = itinerary[0] ?? null;

	const [geofence] = first
		? await db
				.select({
					latitude: locationGeofences.latitude,
					longitude: locationGeofences.longitude,
					radiusMeters: locationGeofences.radiusMeters,
				})
				.from(locationGeofences)
				.where(eq(locationGeofences.locationId, first.locationId))
				.limit(1)
		: [];

	// Only worth fetching once the technician has actually finished today —
	// it's what the End Shift screen shows, not something needed pre-Time In.
	const tomorrowItinerary = session?.timeOut
		? await db
				.select({
					id: schedules.id,
					clientId: schedules.clientId,
					client: clients.name,
					locationId: schedules.locationId,
					location: locations.name,
					sequence: schedules.sequence,
					notes: schedules.notes,
				})
				.from(schedules)
				.innerJoin(clients, eq(clients.id, schedules.clientId))
				.innerJoin(locations, eq(locations.id, schedules.locationId))
				.where(
					and(
						eq(schedules.technicianId, technicianId),
						eq(schedules.scheduledAt, phTomorrow)
					)
				)
				.orderBy(
					sql`CASE WHEN ${schedules.sequence} IS NULL THEN 1 ELSE 0 END`,
					asc(schedules.sequence),
					asc(schedules.id)
				)
		: [];

	return NextResponse.json({
		session: session ?? null,
		itinerary,
		firstStop: first,
		// Null means "no geofence configured for this location" — the client
		// treats that as an admin setup gap, not as "technician is far away".
		geofence: geofence ?? null,
		tomorrowItinerary,
	});
}
