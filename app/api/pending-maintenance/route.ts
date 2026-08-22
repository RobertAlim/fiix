// app/api/pending-maintenance/route.ts
// Lists the latest maintenance record per printer whose status indicates
// outstanding work (needs a technician follow-up), so the scheduler can see
// everything awaiting a schedule in one place. Items already linked to a
// schedule are still returned, flagged as scheduled, so the scheduler gets
// visible confirmation rather than the item silently vanishing.
//
// Resolved items are excluded by construction, not by a separate filter:
// resolving (POST /api/pending-maintenance/[id]/resolve) flips the report's
// own statusId to "Resolved", and "Resolved" is deliberately never included
// in NEEDS_ATTENTION_STATUSES below — so the WHERE clause here already
// drops it. There is no client-side "isResolved" flag to check anymore.
import { db } from "@/db";
import {
	maintain,
	printers,
	deployments,
	clients,
	locations,
	departments,
	models,
	status,
	scheduleDetails,
	schedules,
	users,
} from "@/db/schema";
import { eq, desc, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/require-role";
import { NEEDS_ATTENTION_STATUS_LIST } from "@/lib/maintenance-status";

export async function GET() {
	const authResult = await requireRole(["Admin", "Scheduler"]);
	if (authResult.error) return authResult.error;

	const scheduledTechnician = alias(users, "scheduled_technician");

	const latestMaintain = db.$with("latest_maintain").as(
		db
			.selectDistinctOn([deployments.printerId], {
				mtId: maintain.id,
				printerId: deployments.printerId,
				notes: maintain.notes,
				createdAt: maintain.createdAt,
				statusName: status.name,
			})
			.from(maintain)
			.innerJoin(deployments, eq(maintain.deploymentId, deployments.id))
			.innerJoin(status, eq(status.id, maintain.statusId))
			.orderBy(deployments.printerId, desc(maintain.createdAt), desc(maintain.id))
	);

	// The one schedule (if any) this report is linked to. `originMTId` is
	// meant to point back to a maintenance report from AT MOST one
	// scheduleDetails row — but a printer's report has been seen linked
	// from two (screenshot: two identical "XAGM080560" cards, both
	// "Scheduled · Mj Charles Lacosta"). A plain LEFT JOIN straight to
	// `scheduleDetails` on `originMTId` multiplies the report's single row
	// into one per match when that happens — same class of bug as
	// `currentDeployment` below, just on a different table. This picks the
	// most-recently-created scheduleDetails row deterministically instead
	// of trusting there's only ever one.
	const scheduleLink = db.$with("schedule_link").as(
		db
			.selectDistinctOn([scheduleDetails.originMTId], {
				originMTId: scheduleDetails.originMTId,
				scheduleDetailsId: scheduleDetails.id,
				scheduleId: scheduleDetails.scheduleId,
			})
			.from(scheduleDetails)
			.orderBy(scheduleDetails.originMTId, desc(scheduleDetails.id))
	);

	// The printer's CURRENT deployment. This should always be at most one
	// row per printer (deployedHere: true is meant to be exclusive — see
	// the Transfer route, which retires the old one before inserting a
	// new one) — but a stray duplicate has shown up in production at
	// least once, and an INNER JOIN straight to `deployments` on just
	// `deployedHere = true` silently turns that into a duplicated output
	// row (same maintain id twice), which is what was crashing the
	// Pending Maintenance grid with a React "duplicate key" error. This
	// makes the query itself hold the invariant — deterministically
	// picking the most-recently-created deployedHere row — rather than
	// trusting the data to already be clean.
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

	const rows = await db
		.with(latestMaintain, currentDeployment, scheduleLink)
		.select({
			id: latestMaintain.mtId,
			printerId: printers.id,
			serialNo: printers.serialNo,
			clientId: clients.id,
			client: clients.name,
			locationId: locations.id,
			location: locations.name,
			department: departments.name,
			model: models.name,
			status: latestMaintain.statusName,
			notes: latestMaintain.notes,
			createdAt: latestMaintain.createdAt,
			isScheduled: sql<boolean>`${scheduleLink.scheduleDetailsId} IS NOT NULL`,
			scheduledDate: sql<string | null>`to_char(${schedules.scheduledAt}, 'MM/DD/YYYY')`,
			scheduledTechnicianName: sql<string | null>`
				CASE WHEN ${scheduledTechnician.id} IS NOT NULL
				THEN ${scheduledTechnician.firstName} || ' ' || ${scheduledTechnician.lastName}
				ELSE NULL END
			`,
		})
		.from(latestMaintain)
		.innerJoin(printers, eq(printers.id, latestMaintain.printerId))
		.innerJoin(currentDeployment, eq(currentDeployment.printerId, printers.id))
		.innerJoin(clients, eq(clients.id, currentDeployment.clientId))
		.innerJoin(locations, eq(locations.id, currentDeployment.locationId))
		.innerJoin(departments, eq(departments.id, currentDeployment.departmentId))
		.innerJoin(models, eq(models.id, currentDeployment.modelId))
		.leftJoin(scheduleLink, eq(scheduleLink.originMTId, latestMaintain.mtId))
		.leftJoin(schedules, eq(schedules.id, scheduleLink.scheduleId))
		.leftJoin(scheduledTechnician, eq(scheduledTechnician.id, schedules.technicianId))
		.where(inArray(latestMaintain.statusName, NEEDS_ATTENTION_STATUS_LIST))
		.orderBy(desc(latestMaintain.createdAt));

	return NextResponse.json(rows, { status: 200 });
}
