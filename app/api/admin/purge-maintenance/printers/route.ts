// app/api/admin/purge-maintenance/printers/route.ts
// Printers currently deployed at a given client+location, for the Purge
// Maintenance card-selection step. Deliberately separate from GET
// /api/printers (used by the Schedule page) — that route requires a
// scheduleId and is wired to schedule-detail toggling, neither of which
// applies here. Returns deploymentId + model/department directly so the
// client never needs a second round trip once a card is picked.
import { db } from "@/db";
import { printers, models, departments, deployments } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/require-role";

export async function GET(req: Request) {
	const authResult = await requireRole(["Admin"]);
	if (authResult.error) return authResult.error;

	const { searchParams } = new URL(req.url);
	const clientId = Number(searchParams.get("clientId"));
	const locationId = Number(searchParams.get("locationId"));

	if (
		!Number.isInteger(clientId) ||
		clientId <= 0 ||
		!Number.isInteger(locationId) ||
		locationId <= 0
	) {
		return NextResponse.json(
			{ error: "Valid clientId and locationId are required." },
			{ status: 400 }
		);
	}

	const rows = await db
		.select({
			printerId: printers.id,
			deploymentId: deployments.id,
			serialNo: printers.serialNo,
			modelId: deployments.modelId,
			model: models.name,
			departmentId: deployments.departmentId,
			department: departments.name,
		})
		.from(deployments)
		.innerJoin(printers, eq(printers.id, deployments.printerId))
		.innerJoin(models, eq(deployments.modelId, models.id))
		.innerJoin(departments, eq(deployments.departmentId, departments.id))
		.where(
			and(
				eq(deployments.clientId, clientId),
				eq(deployments.locationId, locationId),
				eq(deployments.deployedHere, true)
			)
		)
		.orderBy(printers.serialNo);

	return NextResponse.json(rows);
}
