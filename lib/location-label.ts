// lib/location-label.ts
//
// Turns a raw GPS fix into a human-readable label for SMS messages —
// "Acme HQ" when the point is close enough to a configured client
// location, otherwise the bare coordinates. Extracted from the GPS-off
// alert (app/api/gps/ping) so the Time Out SMS can reuse the exact same
// rule instead of growing a second, silently-divergent copy.
import "server-only";
import { db } from "@/db";
import { locationGeofences, locations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { distanceMeters } from "@/lib/geofence";

/**
 * Nearest configured geofence pin within 500m, or the raw coordinates if
 * nothing is that close. 500m is deliberately generous — this is "which
 * client is the technician probably at", not a geofence pass/fail check
 * (that's Time In's job, at a much tighter, per-location radius).
 *
 * Returns a bare label ("Acme HQ" or "14.59950, 120.98420") with no
 * leading preposition — callers word it as "at {label}" or "near {label}"
 * depending on context.
 */
export async function describeLastKnownLocation(
	lat: number,
	lng: number
): Promise<string> {
	const pins = await db
		.select({
			name: locations.name,
			latitude: locationGeofences.latitude,
			longitude: locationGeofences.longitude,
		})
		.from(locationGeofences)
		.innerJoin(locations, eq(locations.id, locationGeofences.locationId));

	let nearest: { name: string; distance: number } | null = null;
	for (const p of pins) {
		const d = distanceMeters(lat, lng, p.latitude, p.longitude);
		if (d <= 500 && (!nearest || d < nearest.distance)) {
			nearest = { name: p.name, distance: d };
		}
	}

	return nearest ? nearest.name : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}
