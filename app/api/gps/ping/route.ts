// app/api/gps/ping/route.ts
//
// Called by the technician's own device roughly every 15 seconds while
// they're on duty (see components/GpsReporter.tsx). Upserts this
// technician's single technicianGpsStatus row and, when GPS goes from ON
// to OFF while the technician is still clocked in, sends the SMS alert
// required by the GPS Monitoring feature.
//
// A ping has one of two shapes:
//   - { latitude, longitude, accuracy? }  — a live fix; gpsEnabled = true
//   - { enabled: false }                  — the browser's watchPosition
//     callback errored out (permission revoked, location services turned
//     off, etc.) — there is no coordinate to report
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import {
	technicianGpsStatus,
	technicianAttendance,
	locationGeofences,
	locations,
	users,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireRole } from "@/lib/require-role";
import { sendSmsToRecipients, getActiveSmsRecipientNumbers } from "@/lib/sms";
import { formatClockTime } from "@/lib/attendance";
import { distanceMeters } from "@/lib/geofence";

const bodySchema = z.union([
	z.object({
		enabled: z.literal(true).optional().default(true),
		latitude: z.number().min(-90).max(90),
		longitude: z.number().min(-180).max(180),
		accuracy: z.number().min(0).max(100000).optional(),
	}),
	z.object({
		enabled: z.literal(false),
	}),
]);

/** Best-effort human label for an SMS, not a precise address: the nearest
 * configured geofence pin within 500m, falling back to raw coordinates.
 * 500m is deliberately generous — this is "which client is the technician
 * probably at", not a geofence pass/fail check (that's Time In's job, at a
 * much tighter, per-location radius). */
async function describeLastKnownLocation(
	lat: number,
	lng: number
): Promise<string> {
	const pins = await db
		.select({ name: locations.name, latitude: locationGeofences.latitude, longitude: locationGeofences.longitude })
		.from(locationGeofences)
		.innerJoin(locations, eq(locations.id, locationGeofences.locationId));

	let nearest: { name: string; distance: number } | null = null;
	for (const p of pins) {
		const d = distanceMeters(lat, lng, p.latitude, p.longitude);
		if (d <= 500 && (!nearest || d < nearest.distance)) {
			nearest = { name: p.name, distance: d };
		}
	}

	return nearest
		? nearest.name
		: `near ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export async function POST(req: NextRequest) {
	const auth = await requireRole(["Technician"]);
	if (auth.error) return auth.error;
	const technicianId = auth.user.id;

	const parsed = bodySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json({ error: "Invalid ping payload." }, { status: 400 });
	}
	const data = parsed.data;

	try {
		// Read the PREVIOUS state before overwriting it — this is the only
		// way to detect an ON→OFF transition. Not wrapped in a single atomic
		// statement with the upsert below because neon-http has no real
		// transactions; the resulting race window (two pings arriving
		// milliseconds apart) can at worst double-send one alert SMS, which
		// is a cosmetic annoyance, not a correctness problem worth the
		// complexity here.
		const [previous] = await db
			.select({
				gpsEnabled: technicianGpsStatus.gpsEnabled,
				latitude: technicianGpsStatus.latitude,
				longitude: technicianGpsStatus.longitude,
				lastOffAlertAt: technicianGpsStatus.lastOffAlertAt,
			})
			.from(technicianGpsStatus)
			.where(eq(technicianGpsStatus.technicianId, technicianId))
			.limit(1);

		const now = new Date();

		if (data.enabled === false) {
			await db
				.insert(technicianGpsStatus)
				.values({
					technicianId,
					gpsEnabled: false,
					latitude: null,
					longitude: null,
					accuracy: null,
					capturedAt: null,
					updatedAt: now,
				})
				.onConflictDoUpdate({
					target: technicianGpsStatus.technicianId,
					set: {
						gpsEnabled: false,
						latitude: null,
						longitude: null,
						accuracy: null,
						capturedAt: null,
						updatedAt: now,
					},
				});

			// Alert only on the ON→OFF edge, and only once per off episode —
			// lastOffAlertAt is cleared the moment this technician reports
			// gpsEnabled: true again (see the else branch), so a GPS that
			// stays off doesn't re-alert every ~15s, but a fresh off episode
			// later the same day does alert again.
			const justTurnedOff = previous?.gpsEnabled === true;
			let smsResult: { sent: number; failed: number } | null = null;

			if (justTurnedOff) {
				// Working hours = currently clocked in today (timeIn set, no
				// timeOut yet) — the exact condition the requirement asks for,
				// not just "app is open".
				const phToday = sql<string>`(now() AT TIME ZONE 'Asia/Manila')::date`;
				const [session] = await db
					.select({
						id: technicianAttendance.id,
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
				const onDuty = !!session && !session.timeOut;

				if (onDuty) {
					const [technician] = await db
						.select({ firstName: users.firstName, lastName: users.lastName })
						.from(users)
						.where(eq(users.id, technicianId))
						.limit(1);

					const numbers = await getActiveSmsRecipientNumbers();
					if (technician && numbers.length > 0) {
						const lastLocation =
							previous?.latitude != null && previous?.longitude != null
								? await describeLastKnownLocation(previous.latitude, previous.longitude)
								: "an unknown location";
						const timeStr = formatClockTime(now);
						smsResult = await sendSmsToRecipients(
							numbers,
							`${technician.firstName} ${technician.lastName} has turned off GPS at ${lastLocation} at ${timeStr}.`
						);
					}

					await db
						.update(technicianGpsStatus)
						.set({ lastOffAlertAt: now })
						.where(eq(technicianGpsStatus.technicianId, technicianId));
				}
			}

			return NextResponse.json({ gpsEnabled: false, alertSent: !!smsResult });
		}

		// GPS is ON — upsert the fix and clear any pending off-alert flag so
		// the NEXT off episode (however far away) alerts fresh.
		await db
			.insert(technicianGpsStatus)
			.values({
				technicianId,
				gpsEnabled: true,
				latitude: data.latitude,
				longitude: data.longitude,
				accuracy: data.accuracy ?? null,
				capturedAt: now,
				lastOffAlertAt: null,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: technicianGpsStatus.technicianId,
				set: {
					gpsEnabled: true,
					latitude: data.latitude,
					longitude: data.longitude,
					accuracy: data.accuracy ?? null,
					capturedAt: now,
					lastOffAlertAt: null,
					updatedAt: now,
				},
			});

		return NextResponse.json({ gpsEnabled: true });
	} catch (err) {
		console.error("gps ping failed:", err);
		const message = err instanceof Error ? err.message : String(err);
		if (/does not exist/i.test(message)) {
			return NextResponse.json(
				{
					error:
						"The database schema is out of date for GPS tracking. Run `npm run db:migrate` against this environment.",
				},
				{ status: 500 }
			);
		}
		// Deliberately 200, not 500: this is a background heartbeat the
		// technician never sees, and their actual work (maintenance reports,
		// Time In/Out) must never be affected by a GPS-tracking hiccup. A
		// failed ping just means the next one (in ~15s) tries again.
		return NextResponse.json({ error: "ping not recorded" }, { status: 200 });
	}
}
