// app/api/admin/master/location-geofences/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { locationGeofences, locations, clients } from "@/db/schema";
import { asc, eq, ilike, and } from "drizzle-orm";
import { requireRole } from "@/lib/require-role";

const bodySchema = z.object({
	locationId: z.number().int().positive(),
	latitude: z.number().min(-90).max(90),
	longitude: z.number().min(-180).max(180),
	radiusMeters: z.number().int().min(10).max(5000),
});

export async function GET(req: Request) {
	const auth = await requireRole(["Admin"]);
	if (auth.error) return auth.error;

	const search = new URL(req.url).searchParams.get("search")?.trim();

	const rows = await db
		.select({
			id: locationGeofences.id,
			locationId: locationGeofences.locationId,
			locationName: locations.name,
			clientName: clients.name,
			latitude: locationGeofences.latitude,
			longitude: locationGeofences.longitude,
			radiusMeters: locationGeofences.radiusMeters,
			updatedAt: locationGeofences.updatedAt,
		})
		.from(locationGeofences)
		.innerJoin(locations, eq(locations.id, locationGeofences.locationId))
		.innerJoin(clients, eq(clients.id, locations.clientId))
		.where(
			search
				? and(ilike(locations.name, `%${search}%`))
				: undefined
		)
		.orderBy(asc(clients.name), asc(locations.name));

	return NextResponse.json(rows);
}

export async function POST(req: Request) {
	const auth = await requireRole(["Admin"]);
	if (auth.error) return auth.error;

	const parsed = bodySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "Invalid request", issues: parsed.error.flatten() },
			{ status: 400 }
		);
	}

	const [existing] = await db
		.select({ id: locationGeofences.id })
		.from(locationGeofences)
		.where(eq(locationGeofences.locationId, parsed.data.locationId))
		.limit(1);
	if (existing) {
		return NextResponse.json(
			{ error: "This location already has a geofence configured. Edit it instead." },
			{ status: 409 }
		);
	}

	const [row] = await db
		.insert(locationGeofences)
		.values(parsed.data)
		.returning();

	return NextResponse.json(row, { status: 201 });
}
