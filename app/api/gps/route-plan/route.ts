// app/api/gps/route-plan/route.ts
//
// Derives the "planned route" GPS Monitoring draws for one technician's
// day: where they started, and where they're headed next. Nothing here is
// stored — it's recomputed on every request from data that already exists:
//
//   origin      = the most recently COMPLETED itinerary stop's location,
//                 or the technician's Time In location if none are done yet
//   destination = the next NOT-YET-COMPLETE stop after that, in sequence
//
// "Complete" reuses the exact aggregate GET /api/schedules/tracker already
// computes (COUNT/SUM over scheduleDetails.isMaintained) — a stop with zero
// scheduleDetails rows is treated as not-yet-determinable, same as that
// route, rather than silently "complete".
import { NextResponse } from "next/server";
import { db } from "@/db";
import {
	technicianAttendance,
	schedules,
	scheduleDetails,
	clients,
	locations,
	locationGeofences,
} from "@/db/schema";
import { eq, and, asc, sql } from "drizzle-orm";
import { requireRole } from "@/lib/require-role";

interface StopPoint {
	scheduleId: number;
	sequence: number | null;
	client: string;
	location: string;
	latitude: number | null;
	longitude: number | null;
	total: number;
	done: number;
	complete: boolean;
	status: "done" | "current" | "upcoming";
}

export async function GET(req: Request) {
	const auth = await requireRole(["Admin", "Scheduler"]);
	if (auth.error) return auth.error;

	const technicianIdParam = new URL(req.url).searchParams.get("technicianId");
	const technicianId = Number(technicianIdParam);
	if (!technicianIdParam || !Number.isInteger(technicianId) || technicianId <= 0) {
		return NextResponse.json({ error: "Invalid technicianId." }, { status: 400 });
	}

	const phToday = sql<string>`(now() AT TIME ZONE 'Asia/Manila')::date`;

	const [session] = await db
		.select({
			timeIn: technicianAttendance.timeIn,
			timeInLatitude: technicianAttendance.timeInLatitude,
			timeInLongitude: technicianAttendance.timeInLongitude,
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

	if (!session) {
		return NextResponse.json({
			status: "not_started",
			origin: null,
			destination: null,
			stops: [],
		});
	}

	const rows = await db
		.select({
			scheduleId: schedules.id,
			sequence: schedules.sequence,
			client: clients.name,
			location: locations.name,
			latitude: locationGeofences.latitude,
			longitude: locationGeofences.longitude,
			total: sql<number>`COALESCE(COUNT(${scheduleDetails.id}), 0)`.as("total"),
			done: sql<number>`COALESCE(SUM(CASE WHEN ${scheduleDetails.isMaintained} THEN 1 ELSE 0 END), 0)`.as(
				"done"
			),
		})
		.from(schedules)
		.innerJoin(clients, eq(clients.id, schedules.clientId))
		.innerJoin(locations, eq(locations.id, schedules.locationId))
		.leftJoin(scheduleDetails, eq(scheduleDetails.scheduleId, schedules.id))
		.leftJoin(locationGeofences, eq(locationGeofences.locationId, schedules.locationId))
		.where(and(eq(schedules.technicianId, technicianId), eq(schedules.scheduledAt, phToday)))
		.groupBy(
			schedules.id,
			schedules.sequence,
			clients.name,
			locations.name,
			locationGeofences.latitude,
			locationGeofences.longitude
		)
		.orderBy(
			sql`CASE WHEN ${schedules.sequence} IS NULL THEN 1 ELSE 0 END`,
			asc(schedules.sequence),
			asc(schedules.id)
		);

	const stops: Omit<StopPoint, "status">[] = rows.map((r) => {
		const total = Number(r.total ?? 0);
		const done = Number(r.done ?? 0);
		return {
			scheduleId: r.scheduleId,
			sequence: r.sequence,
			client: r.client,
			location: r.location,
			latitude: r.latitude,
			longitude: r.longitude,
			total,
			done,
			complete: total > 0 && done === total,
		};
	});

	// Walk in sequence order: the origin is the LAST completed stop seen so
	// far; the destination is the FIRST not-yet-complete stop after it.
	// Scanning forward once (rather than searching independently for each)
	// keeps "origin" and "destination" from ever landing on the same stop.
	let lastCompleteIdx = -1;
	for (let i = 0; i < stops.length; i++) {
		if (stops[i].complete) lastCompleteIdx = i;
	}
	const destinationIdx = stops.findIndex(
		(s, i) => i > lastCompleteIdx && !s.complete
	);

	const originStop =
		lastCompleteIdx >= 0 && stops[lastCompleteIdx].latitude != null
			? stops[lastCompleteIdx]
			: null;

	const origin = originStop
		? {
				label: originStop.location,
				latitude: originStop.latitude as number,
				longitude: originStop.longitude as number,
			}
		: {
				// Nothing completed yet — the day started at Time In.
				label: "Time In location",
				latitude: session.timeInLatitude,
				longitude: session.timeInLongitude,
			};

	const destinationStop =
		destinationIdx >= 0 && stops[destinationIdx].latitude != null
			? stops[destinationIdx]
			: null;
	const destination = destinationStop
		? {
				label: `${destinationStop.client} — ${destinationStop.location}`,
				latitude: destinationStop.latitude as number,
				longitude: destinationStop.longitude as number,
			}
		: null;

	const annotatedStops: StopPoint[] = stops.map((s, i) => ({
		...s,
		status: s.complete ? "done" : i === destinationIdx ? "current" : "upcoming",
	}));

	const status =
		stops.length === 0
			? "no_itinerary"
			: destination === null
				? "all_completed"
				: "in_progress";

	return NextResponse.json({
		status,
		timedOut: !!session.timeOut,
		origin,
		destination,
		stops: annotatedStops,
	});
}
