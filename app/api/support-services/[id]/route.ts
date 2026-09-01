// app/api/support-services/[id]/route.ts
//
// Bundles the activity plus its client+location's available signatories
// in one response — same reasoning as GET /api/maintain bundling
// signatories alongside printer/deployment info: a technician opening
// this form always needs both together, and a weak-connection round
// trip shouldn't be paid twice for data that's always fetched as a pair.
import { NextResponse } from "next/server";
import { db } from "@/db";
import {
	supportServices,
	supportServiceType,
	clients,
	locations,
	locationGeofences,
	signatories,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireRole } from "@/lib/require-role";

function parseId(id: string) {
	const n = Number(id);
	return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ id: string }> }
) {
	const authResult = await requireRole(["Admin", "Scheduler", "Technician"]);
	if (authResult.error) return authResult.error;

	const id = parseId((await params).id);
	if (!id) {
		return NextResponse.json({ error: "Invalid id." }, { status: 400 });
	}

	const [row] = await db
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
		.where(eq(supportServices.id, id))
		.limit(1);

	if (!row) {
		return NextResponse.json({ error: "Support service not found." }, { status: 404 });
	}

	// Same client+location scoping as GET /api/signatories — a client-only
	// signatory (locationId IS NULL, predates that column) is still
	// included regardless of location.
	const signatoryRows = await db
		.select({ id: signatories.id, firstName: signatories.firstName, lastName: signatories.lastName })
		.from(signatories)
		.where(
			and(
				eq(signatories.clientId, row.clientId),
				sql`(${signatories.locationId} = ${row.locationId} OR ${signatories.locationId} IS NULL)`
			)
		);

	return NextResponse.json({
		supportService: row,
		signatories: signatoryRows.map((s) => ({
			value: String(s.id),
			label: `${s.firstName} ${s.lastName}`,
		})),
	});
}
