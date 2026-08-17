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
import { eq, and, desc, inArray, sql } from "drizzle-orm";
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

	const rows = await db
		.with(latestMaintain)
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
			isScheduled: sql<boolean>`${scheduleDetails.id} IS NOT NULL`,
			scheduledDate: sql<string | null>`to_char(${schedules.scheduledAt}, 'MM/DD/YYYY')`,
			scheduledTechnicianName: sql<string | null>`
				CASE WHEN ${scheduledTechnician.id} IS NOT NULL
				THEN ${scheduledTechnician.firstName} || ' ' || ${scheduledTechnician.lastName}
				ELSE NULL END
			`,
		})
		.from(latestMaintain)
		.innerJoin(printers, eq(printers.id, latestMaintain.printerId))
		.innerJoin(deployments, eq(deployments.printerId, printers.id))
		.innerJoin(clients, eq(clients.id, deployments.clientId))
		.innerJoin(locations, eq(locations.id, deployments.locationId))
		.innerJoin(departments, eq(departments.id, deployments.departmentId))
		.innerJoin(models, eq(models.id, deployments.modelId))
		.leftJoin(scheduleDetails, eq(scheduleDetails.originMTId, latestMaintain.mtId))
		.leftJoin(schedules, eq(schedules.id, scheduleDetails.scheduleId))
		.leftJoin(scheduledTechnician, eq(scheduledTechnician.id, schedules.technicianId))
		.where(
			and(
				eq(deployments.deployedHere, true),
				inArray(latestMaintain.statusName, NEEDS_ATTENTION_STATUS_LIST)
			)
		)
		.orderBy(desc(latestMaintain.createdAt));

	return NextResponse.json(rows, { status: 200 });
}
