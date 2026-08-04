// app/api/missed-schedules/route.ts
// Schedules whose date has passed while the work was never marked done —
// i.e. scheduleDetails.isMaintained is still false and schedules.scheduledAt
// is earlier than today.
//
// "Today" is evaluated in Asia/Manila inside Postgres rather than from the
// server clock: Vercel functions run UTC, so a Manila-morning request would
// otherwise still be "yesterday" and a schedule would be reported missed for
// several hours before it actually was.
import { db } from "@/db";
import {
	schedules,
	scheduleDetails,
	printers,
	deployments,
	clients,
	locations,
	departments,
	models,
	priorities,
	users,
} from "@/db/schema";
import { eq, and, sql, asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/require-role";

export async function GET() {
	const authResult = await requireRole(["Admin", "Scheduler"]);
	if (authResult.error) return authResult.error;

	const phToday = sql`(now() AT TIME ZONE 'Asia/Manila')::date`;

	// A missed entry is considered handled — and drops off this list — as soon
	// as the same printer appears on a LATER schedule. That covers both the
	// reschedule flow below and a technician simply catching up on a later
	// visit, without destroying the original record or needing a new column.
	const supersededByNewerSchedule = sql`EXISTS (
		SELECT 1
		FROM "scheduleDetails" sd2
		JOIN "schedules" s2 ON s2."id" = sd2."scheduleId"
		WHERE sd2."printerId" = ${scheduleDetails.printerId}
		  AND s2."scheduledAt" > ${schedules.scheduledAt}
	)`;

	const rows = await db
		.select({
			scheduleDetailsId: scheduleDetails.id,
			scheduleId: schedules.id,
			// maintain.id that originally triggered this visit, when there was
			// one. Null for routine schedules created from scratch.
			originMTId: scheduleDetails.originMTId,
			printerId: scheduleDetails.printerId,
			serialNo: printers.serialNo,
			model: models.name,
			department: departments.name,
			clientId: schedules.clientId,
			client: clients.name,
			locationId: schedules.locationId,
			location: locations.name,
			technicianId: schedules.technicianId,
			technician: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
			priorityId: schedules.priority,
			priority: priorities.name,
			notes: schedules.notes,
			scheduledAt: schedules.scheduledAt,
			scheduledDate: sql<string>`to_char(${schedules.scheduledAt}, 'MM/DD/YYYY')`,
			daysOverdue: sql<number>`(${phToday} - ${schedules.scheduledAt})::int`,
		})
		.from(scheduleDetails)
		.innerJoin(schedules, eq(schedules.id, scheduleDetails.scheduleId))
		.innerJoin(printers, eq(printers.id, scheduleDetails.printerId))
		.innerJoin(users, eq(users.id, schedules.technicianId))
		.leftJoin(priorities, eq(priorities.id, schedules.priority))
		// Model/department describe the printer as deployed today.
		.leftJoin(
			deployments,
			and(
				eq(deployments.printerId, printers.id),
				eq(deployments.deployedHere, true)
			)
		)
		.leftJoin(models, eq(models.id, deployments.modelId))
		.leftJoin(departments, eq(departments.id, deployments.departmentId))
		// Client and location come from the schedule itself — that's who the
		// visit was promised to, which is what the scheduler needs to answer for.
		.innerJoin(clients, eq(clients.id, schedules.clientId))
		.innerJoin(locations, eq(locations.id, schedules.locationId))
		.where(
			and(
				eq(scheduleDetails.isMaintained, false),
				sql`${schedules.scheduledAt} < ${phToday}`,
				sql`NOT ${supersededByNewerSchedule}`
			)
		)
		// Longest-overdue first: that's the queue the scheduler works through.
		.orderBy(asc(schedules.scheduledAt), asc(printers.serialNo));

	return NextResponse.json(rows, { status: 200 });
}
