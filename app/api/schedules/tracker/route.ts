import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql, eq } from "drizzle-orm";
import {
	schedules,
	scheduleDetails,
	clients,
	locations,
	users,
	priorities,
	supportServices,
	supportServiceType,
} from "@/db/schema";
import type { ScheduleTrackerRow } from "@/types/tracker";
import { requireRole } from "@/lib/require-role";

export async function GET() {
	const authResult = await requireRole(["Admin", "Scheduler"]);
	if (authResult.error) return authResult.error;

	// Aggregate progress per schedule. LEFT JOINs both scheduleDetails
	// (printer stops — Technical Services) AND supportServices (via
	// scheduleId — the Support Services completion for a printer-less
	// schedule, see db/schema.ts's own comment on that link). A schedule
	// only ever has rows in ONE of the two, so joining both and letting
	// COALESCE/CASE pick the right one per schedule in JS below is
	// simpler and less error-prone than two separate queries merged by
	// hand afterward.
	const rows = await db
		.select({
			id: schedules.id,
			scheduledAt: schedules.scheduledAt,
			notes: schedules.notes,
			client: clients.name,
			clientId: schedules.clientId,
			location: locations.name,
			technician:
				sql<string>`${users.firstName} || ' ' || ${users.lastName}`.as(
					"technician"
				),
			priority: priorities.name,
			printerTotal: sql<number>`COALESCE(COUNT(DISTINCT ${scheduleDetails.id}), 0)`.as(
				"printerTotal"
			),
			printerDone: sql<number>`COALESCE(SUM(CASE WHEN ${scheduleDetails.isMaintained} THEN 1 ELSE 0 END), 0)`.as(
				"printerDone"
			),
			// A schedule can only have ONE linked supportServices row (the
			// completion route enforces this — see
			// POST /api/support-services/complete's "already documented"
			// guard), so MAX() here is just a way to pull a single scalar
			// out of a GROUP BY without adding it to the GROUP BY clause
			// itself (Postgres requires every non-aggregated selected
			// column to be grouped, or wrapped in an aggregate).
			supportServiceStatus: sql<string | null>`MAX(${supportServices.status})`.as(
				"supportServiceStatus"
			),
			supportServiceTypeName: sql<string | null>`MAX(${supportServiceType.name})`.as(
				"supportServiceTypeName"
			),
		})
		.from(schedules)
		.leftJoin(scheduleDetails, eq(scheduleDetails.scheduleId, schedules.id))
		.leftJoin(supportServices, eq(supportServices.scheduleId, schedules.id))
		.leftJoin(
			supportServiceType,
			eq(supportServiceType.id, supportServices.supportServiceTypeId)
		)
		.innerJoin(clients, eq(clients.id, schedules.clientId))
		.innerJoin(locations, eq(locations.id, schedules.locationId))
		.innerJoin(users, eq(users.id, schedules.technicianId))
		.innerJoin(priorities, eq(priorities.id, schedules.priority))
		.groupBy(
			schedules.id,
			schedules.scheduledAt,
			schedules.notes,
			schedules.clientId,
			clients.name,
			locations.name,
			users.firstName,
			users.lastName,
			priorities.name
		)
		.orderBy(sql`MAX(${schedules.scheduledAt}) DESC`);

	const data: ScheduleTrackerRow[] = rows.map((r) => {
		const printerTotal = Number(r.printerTotal ?? 0);
		const isSupportService = printerTotal === 0;

		// Support Services task: a single unit of work ("1/1"), done once
		// the technician's submission is marked Achieved. "Not Achieved"
		// counts as NOT done (open), same as an unmaintained printer stop —
		// the technician attempted it, but the task itself isn't complete.
		//
		// Printer schedule: unchanged from before — total/done straight
		// off scheduleDetails.isMaintained.
		const total = isSupportService ? 1 : printerTotal;
		const done = isSupportService
			? r.supportServiceStatus === "Achieved"
				? 1
				: 0
			: Number(r.printerDone ?? 0);

		const open = Math.max(total - done, 0);
		const percent = total > 0 ? Math.round((done / total) * 100) : 0;
		return {
			id: r.id,
			scheduledAt: r.scheduledAt as unknown as string,
			notes: r.notes ?? null,
			client: r.client,
			clientId: r.clientId,
			location: r.location,
			technician: r.technician,
			priority: r.priority,
			total,
			done,
			open,
			percent,
			isSupportService,
			supportServiceType: r.supportServiceTypeName ?? null,
		};
	});

	return NextResponse.json({ data });
}
