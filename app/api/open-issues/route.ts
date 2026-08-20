// app/api/open-issues/route.ts
// Lists printers whose MOST RECENT maintenance record still shows an
// unresolved status.
//
// The previous version selected the latest record per printer and left the
// status filter commented out, so the caller filtered client-side. That looks
// equivalent but isn't: the ordering had no tie-breaker beyond createdAt, so
// when a follow-up visit landed on the same timestamp as the original report
// (routine, since offline reports sync in batches) Postgres could keep either
// row — and if it kept the older one, a printer that HAD been fixed stayed on
// the list.
//
// Moving the filter server-side and applying it AFTER the latest-per-printer
// pass is what actually makes an issue disappear once the printer is
// maintained: a newer "good" record wins the distinct-on, and the status
// filter then drops the printer entirely. Note the ordering matters —
// filtering by status BEFORE the distinct-on would pick the latest record
// that still LOOKS broken and resurrect resolved issues.
import { db } from "@/db";
import {
	maintain,
	users,
	status,
	printers,
	models,
	clients,
	locations,
	departments,
	deployments,
} from "@/db/schema";
import { eq, sql, desc, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/require-role";
import { NEEDS_ATTENTION_STATUS_LIST } from "@/lib/maintenance-status";

export async function GET() {
	const authResult = await requireRole(["Admin", "Scheduler"]);
	if (authResult.error) return authResult.error;

	// Latest maintenance record per printer. Ties on createdAt are broken by
	// id descending so the newest row always wins deterministically.
	const latestMaintain = db.$with("latest_maintain").as(
		db
			.selectDistinctOn([deployments.printerId], {
				mtId: maintain.id,
				printerId: deployments.printerId,
				deploymentId: maintain.deploymentId,
				notes: maintain.notes,
				createdAt: maintain.createdAt,
				statusName: status.name,
				userId: maintain.userId,
			})
			.from(maintain)
			.innerJoin(deployments, eq(maintain.deploymentId, deployments.id))
			.innerJoin(status, eq(status.id, maintain.statusId))
			.orderBy(deployments.printerId, desc(maintain.createdAt), desc(maintain.id))
	);

	// See the identical CTE in app/api/pending-maintenance/route.ts and
	// app/api/unmaintained-printers/route.ts — this defends against the
	// same production data issue (a printer with more than one
	// `deployments` row marked deployedHere: true), which otherwise
	// duplicates that printer's row here too and causes a React
	// "duplicate key" error on any grid keyed by this route's `id`.
	const currentDeployment = db.$with("current_deployment").as(
		db
			.selectDistinctOn([deployments.printerId], {
				printerId: deployments.printerId,
				clientId: deployments.clientId,
				locationId: deployments.locationId,
				departmentId: deployments.departmentId,
				modelId: deployments.modelId,
			})
			.from(deployments)
			.where(eq(deployments.deployedHere, true))
			.orderBy(deployments.printerId, desc(deployments.id))
	);

	const data = await db
		.with(latestMaintain, currentDeployment)
		.select({
			id: latestMaintain.mtId,
			serialNo: printers.serialNo,
			client: clients.name,
			location: locations.name,
			department: departments.name,
			model: models.name,
			status: latestMaintain.statusName,
			technician: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
			date: sql<string>`to_char(${latestMaintain.createdAt}, 'MM/DD/YYYY')`,
			createdAt: latestMaintain.createdAt,
			notes: latestMaintain.notes,
		})
		.from(latestMaintain)
		.innerJoin(printers, eq(printers.id, latestMaintain.printerId))
		// Display fields come from the printer's CURRENT deployment, not the
		// deployment the old report was filed against — a transferred printer
		// should show where it is now.
		.innerJoin(currentDeployment, eq(currentDeployment.printerId, printers.id))
		.innerJoin(clients, eq(clients.id, currentDeployment.clientId))
		.innerJoin(locations, eq(locations.id, currentDeployment.locationId))
		.innerJoin(departments, eq(departments.id, currentDeployment.departmentId))
		.innerJoin(models, eq(models.id, currentDeployment.modelId))
		.innerJoin(users, eq(users.id, latestMaintain.userId))
		.where(inArray(latestMaintain.statusName, NEEDS_ATTENTION_STATUS_LIST))
		.orderBy(desc(latestMaintain.createdAt));

	return NextResponse.json(data, { status: 200 });
}
