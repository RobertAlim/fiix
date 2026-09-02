// app/api/attendance/status/route.ts
// Everything the Time In screen needs in one call: whether the technician
// already has an open (or closed) session today, today's itinerary in
// sequence order, and the geofence for whichever stop is first — so the
// client can decide button state without a second round trip.
//
// EXTENDED for the mobile Time Out geofence check: itinerary stops now
// carry latitude/longitude directly (previously they had none at all —
// this was the actual root cause of the mobile app's "no location on
// file for your last stop" bug, not a flaky client-side join as first
// suspected), and the response now includes lastStop/lastGeofence,
// analogous to firstStop/geofence but for the LAST stop of the day —
// spanning BOTH `schedules` (printer visits) and `supportServices`
// (non-printer client errands), per the explicit requirement that a
// technician's day can legitimately end at either.
import { db } from "@/db";
import {
	technicianAttendance,
	schedules,
	clients,
	locations,
	locationGeofences,
	supportServices,
} from "@/db/schema";
import { eq, and, asc, sql, isNull } from "drizzle-orm";
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
			// NEW — previously absent entirely. Null when the location has
			// no geofence pin configured yet; the mobile client treats
			// that as "hide the navigate icon" rather than linking to
			// (0, 0) or guessing.
			latitude: locationGeofences.latitude,
			longitude: locationGeofences.longitude,
		})
		.from(schedules)
		.innerJoin(clients, eq(clients.id, schedules.clientId))
		.innerJoin(locations, eq(locations.id, schedules.locationId))
		.leftJoin(locationGeofences, eq(locationGeofences.locationId, schedules.locationId))
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

	// Today's Support Services — fetched here (not just from the mobile
	// app's separate /api/support-services call) specifically to compute
	// lastStop/lastGeofence below without a second round trip, and so this
	// route stays the single source of truth for "today's full itinerary"
	// the same way it already is for firstStop/geofence.
	//
	// Wrapped defensively: this whole block is NEW, additive functionality
	// layered onto a route that Time In already depended on working. If
	// anything here throws — most plausibly the `supportServices` table
	// not existing yet on a database this migration hasn't been run
	// against — it must not take down session/itinerary/firstStop/geofence,
	// which are the pre-existing, critical fields Time In has relied on
	// all along. Degrading lastStop/lastGeofence to schedules-only (the
	// exact behavior before this feature existed) is a far better failure
	// mode than a 500 that empties the entire Dashboard.
	let lastStop: {
		id: number;
		kind: "schedule" | "support";
		latitude: number | null;
		longitude: number | null;
	} | null = null;
	let lastGeofence: { latitude: number; longitude: number; radiusMeters: number } | null = null;

	try {
		const supportRows = await db
			.select({
				id: supportServices.id,
				clientId: supportServices.clientId,
				locationId: supportServices.locationId,
				sequence: supportServices.sequence,
				latitude: locationGeofences.latitude,
				longitude: locationGeofences.longitude,
			})
			.from(supportServices)
			.leftJoin(locationGeofences, eq(locationGeofences.locationId, supportServices.locationId))
			.where(
				and(
					eq(supportServices.technicianId, technicianId),
					eq(supportServices.scheduledAt, phToday),
					// Same reasoning as GET /api/support-services' own filter: a
					// row with scheduleId set is a completed printer-less
					// schedule, already represented in `itinerary` above via
					// that schedule. Without this, the last-stop candidate list
					// would count that one physical stop TWICE (once via the
					// schedule, once via its linked completion row), which
					// could distort which one sorts last for no real reason —
					// they're the same location either way.
					isNull(supportServices.scheduleId)
				)
			);

		// lastStop/lastGeofence — the LAST stop of the day across BOTH
		// schedules and supportServices, for the mobile Time Out geofence
		// check.
		//
		// Ordering across two tables with only ONE of them (schedules)
		// consistently sequenced is a real, unresolved gap — supportServices
		// only got a `sequence` column in the same migration that created
		// the table (0063), so on day one every row has sequence = NULL.
		// Rather than guess at a cross-table ordering with no reliable
		// signal, this applies one explicit, defensible rule: if EITHER
		// source is completely empty, the answer is unambiguous (the other
		// source's last-sequenced row). If BOTH have entries, sequence
		// values are compared directly where both sides have one; a row
		// with a null sequence sorts after any row that has one, and
		// between two null sequences the higher id (created later) wins as
		// a last-resort tiebreak. This is exactly correct once a Scheduler
		// UI assigns sequence across both types of stop in one ordered day
		// plan — until then it degrades to "most recently created," a
		// reasonable default but not a guarantee.
		type LastCandidate = {
			kind: "schedule" | "support";
			id: number;
			sequence: number | null;
			latitude: number | null;
			longitude: number | null;
		};
		const candidates: LastCandidate[] = [
			...itinerary.map((s) => ({
				kind: "schedule" as const,
				id: s.id,
				sequence: s.sequence,
				latitude: s.latitude,
				longitude: s.longitude,
			})),
			...supportRows.map((s) => ({
				kind: "support" as const,
				id: s.id,
				sequence: s.sequence,
				latitude: s.latitude,
				longitude: s.longitude,
			})),
		];
		candidates.sort((a, b) => {
			if (a.sequence != null && b.sequence != null) return a.sequence - b.sequence;
			if (a.sequence != null) return -1;
			if (b.sequence != null) return 1;
			return a.id - b.id;
		});
		const lastCandidate = candidates.length > 0 ? candidates[candidates.length - 1] : null;
		lastStop = lastCandidate
			? {
					id: lastCandidate.id,
					kind: lastCandidate.kind,
					latitude: lastCandidate.latitude,
					longitude: lastCandidate.longitude,
			  }
			: null;

		// radiusMeters isn't per-stop — reuses the SAME location's geofence
		// row (any location with a pin has exactly one locationGeofences
		// row, one radius). Re-derived from whichever stop won above via
		// its locationId, looked up from the winning source's own row
		// rather than re-querying by lat/lng (which could ambiguously match
		// more than one location).
		if (lastCandidate) {
			const winningLocationId =
				lastCandidate.kind === "schedule"
					? itinerary.find((s) => s.id === lastCandidate.id)?.locationId
					: supportRows.find((s) => s.id === lastCandidate.id)?.locationId;
			if (winningLocationId != null) {
				const [row] = await db
					.select({
						latitude: locationGeofences.latitude,
						longitude: locationGeofences.longitude,
						radiusMeters: locationGeofences.radiusMeters,
					})
					.from(locationGeofences)
					.where(eq(locationGeofences.locationId, winningLocationId))
					.limit(1);
				lastGeofence = row ?? null;
			}
		}
	} catch (err) {
		// Logged, not rethrown — see the block comment above for why this
		// has to degrade rather than fail the whole request. Falls back to
		// schedules-only lastStop, which is exactly what this route
		// returned before Support Services existed, so the mobile Time Out
		// gate keeps working for a printer-only day even while this is
		// broken.
		console.error("attendance/status: lastStop/lastGeofence computation failed, falling back to schedules-only:", err);
		const sortedSchedulesOnly = [...itinerary].sort((a, b) => {
			if (a.sequence != null && b.sequence != null) return a.sequence - b.sequence;
			if (a.sequence != null) return -1;
			if (b.sequence != null) return 1;
			return a.id - b.id;
		});
		const last = sortedSchedulesOnly[sortedSchedulesOnly.length - 1] ?? null;
		lastStop = last ? { id: last.id, kind: "schedule", latitude: last.latitude, longitude: last.longitude } : null;
		if (last) {
			try {
				const [row] = await db
					.select({
						latitude: locationGeofences.latitude,
						longitude: locationGeofences.longitude,
						radiusMeters: locationGeofences.radiusMeters,
					})
					.from(locationGeofences)
					.where(eq(locationGeofences.locationId, last.locationId))
					.limit(1);
				lastGeofence = row ?? null;
			} catch {
				lastGeofence = null;
			}
		}
	}

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
		lastStop,
		lastGeofence,
		tomorrowItinerary,
	});
}
