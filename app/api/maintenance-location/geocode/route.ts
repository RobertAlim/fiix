import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	maintain,
	maintenanceLocation,
	maintenanceSyncEvents,
} from "@/db/schema";
import { requireRole } from "@/lib/require-role";
import { reverseGeocodeServer } from "@/lib/geocoder";

const bodySchema = z.object({
	clientUuid: z.string().uuid(),
});

/**
 * POST /api/maintenance-location/geocode
 * Deferred reverse-geocoding for reports whose location row was stored with
 * coordinates only (device offline at capture AND the provider was
 * unavailable at sync time). Called by the sync engine; safe to repeat.
 */
export async function POST(req: NextRequest) {
	const authResult = await requireRole(["Admin", "Technician"]);
	if (authResult.error) return authResult.error;

	const parsed = bodySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json({ error: "Invalid body" }, { status: 400 });
	}

	const [row] = await db
		.select({
			locationId: maintenanceLocation.id,
			latitude: maintenanceLocation.latitude,
			longitude: maintenanceLocation.longitude,
			reverseGeocoded: maintenanceLocation.reverseGeocoded,
		})
		.from(maintain)
		.innerJoin(
			maintenanceLocation,
			eq(maintenanceLocation.maintenanceId, maintain.id)
		)
		.where(eq(maintain.clientUuid, parsed.data.clientUuid))
		.limit(1);

	if (!row) {
		return NextResponse.json(
			{ error: "No location record for this report" },
			{ status: 404 }
		);
	}

	// Already resolved (e.g. by the sync POST or a concurrent call) — done.
	if (row.reverseGeocoded) {
		return NextResponse.json({ ok: true, alreadyGeocoded: true });
	}

	const geocode = await reverseGeocodeServer(row.latitude, row.longitude);
	if (!geocode) {
		// Provider unavailable — the sync engine keeps needsGeocode set and
		// retries on a later cycle. Coordinates remain the source of truth.
		return NextResponse.json(
			{ error: "Reverse geocoding unavailable" },
			{ status: 502 }
		);
	}

	await db
		.update(maintenanceLocation)
		.set({
			locationName: geocode.locationName,
			formattedAddress: geocode.formattedAddress,
			city: geocode.city,
			province: geocode.province,
			country: geocode.country,
			postalCode: geocode.postalCode,
			reverseGeocoded: true,
			updatedAt: sql`now()`,
		})
		.where(eq(maintenanceLocation.id, row.locationId));

	try {
		await db.insert(maintenanceSyncEvents).values({
			clientUuid: parsed.data.clientUuid,
			event: "reverse-geocoded",
			detail: "deferred",
		});
	} catch {
		// Audit is best-effort.
	}

	return NextResponse.json({ ok: true, locationName: geocode.locationName });
}
