// app/api/location-coordinates/route.ts
//
// Coordinates for client locations, used to build Google Maps directions
// links in the Itinerary Order module.
//
// Why this exists rather than reusing GET /api/admin/master/location-geofences:
// that route is Admin-only, but Itinerary Order belongs to the Schedule
// module, which Schedulers use too. Rather than widening the master-data
// route (which also exposes radius and lets the same module write), this
// is a deliberately narrow read: location id and pin, nothing else.
//
// The radius is intentionally NOT returned. It's a Time-In enforcement
// detail, and nothing here needs it.
import { NextResponse } from "next/server";
import { db } from "@/db";
import { locationGeofences } from "@/db/schema";
import { requireRole } from "@/lib/require-role";

export async function GET() {
	const auth = await requireRole(["Admin", "Scheduler"]);
	if (auth.error) return auth.error;

	const rows = await db
		.select({
			locationId: locationGeofences.locationId,
			latitude: locationGeofences.latitude,
			longitude: locationGeofences.longitude,
		})
		.from(locationGeofences);

	return NextResponse.json(rows);
}
