// app/api/support-services/route.ts
//
// Mirrors GET /api/schedule's "Dashboard" branch exactly in shape and
// role gating — the mobile app's supportQuery request is structurally
// identical to its scheduleQuery request (same technicianId/scheduledAt
// params, same date format), and this route now genuinely IS that
// endpoint rather than a 404.
import { NextResponse } from "next/server";
import { db } from "@/db";
import {
	supportServices,
	supportServiceType,
	clients,
	locations,
	locationGeofences,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireRole } from "@/lib/require-role";

export async function GET(req: Request) {
	// Technician is the real consumer (mobile Dashboard), but Admin/
	// Scheduler are included defensively for a future web-side view of
	// the same data — matching GET /api/schedule's own non-pageSource
	// branch, which allows all three for exactly this reason.
	const authResult = await requireRole(["Admin", "Scheduler", "Technician"]);
	if (authResult.error) return authResult.error;

	const { searchParams } = new URL(req.url);
	const technicianIdParam = searchParams.get("technicianId");
	const scheduledAt = searchParams.get("scheduledAt");

	if (!technicianIdParam || !scheduledAt) {
		// Always answer with an array, never a bare message object — same
		// "the client types this as an array and reads .length off it"
		// reasoning as GET /api/schedule's own empty-input branch.
		return NextResponse.json([], { status: 200 });
	}
	const technicianId = Number(technicianIdParam);
	if (!Number.isInteger(technicianId) || technicianId <= 0) {
		return NextResponse.json([], { status: 200 });
	}

	const rows = await db
		.select({
			id: supportServices.id,
			clientId: supportServices.clientId,
			client: clients.name,
			locationId: supportServices.locationId,
			location: locations.name,
			supportServiceTypeId: supportServices.supportServiceTypeId,
			supportServiceType: supportServiceType.name,
			notes: supportServices.notes,
			status: supportServices.status,
			completedAt: supportServices.completedAt,
			latitude: locationGeofences.latitude,
			longitude: locationGeofences.longitude,
		})
		.from(supportServices)
		.innerJoin(clients, eq(clients.id, supportServices.clientId))
		.innerJoin(locations, eq(locations.id, supportServices.locationId))
		.innerJoin(
			supportServiceType,
			eq(supportServiceType.id, supportServices.supportServiceTypeId)
		)
		.leftJoin(locationGeofences, eq(locationGeofences.locationId, supportServices.locationId))
		.where(
			and(
				eq(supportServices.technicianId, technicianId),
				eq(supportServices.scheduledAt, scheduledAt)
			)
		);

	return NextResponse.json(rows, { status: 200 });
}
