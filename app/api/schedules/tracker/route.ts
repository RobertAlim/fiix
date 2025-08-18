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
} from "@/db/schema";
import type { ScheduleTrackerRow } from "@/types/tracker";

export async function GET() {
	// Aggregate progress per schedule
	const rows = await db
		.select({
			id: schedules.id,
			scheduledAt: schedules.scheduledAt,
			notes: schedules.notes,
			client: clients.name,
			location: locations.name,
			technician:
				sql<string>`${users.firstName} || ' ' || ${users.lastName}`.as(
					"technician"
				),
			priority: priorities.name,
			total: sql<number>`COALESCE(COUNT(${scheduleDetails.id}), 0)`.as("total"),
			done: sql<number>`COALESCE(SUM(CASE WHEN ${scheduleDetails.isMaintained} THEN 1 ELSE 0 END), 0)`.as(
				"done"
			),
		})
		.from(schedules)
		.leftJoin(scheduleDetails, eq(scheduleDetails.scheduleId, schedules.id))
		.innerJoin(clients, eq(clients.id, schedules.clientId))
		.innerJoin(locations, eq(locations.id, schedules.locationId))
		.innerJoin(users, eq(users.id, schedules.technicianId))
		.innerJoin(priorities, eq(priorities.id, schedules.priority))
		.groupBy(
			schedules.id,
			schedules.scheduledAt,
			schedules.notes,
			clients.name,
			locations.name,
			users.firstName,
			users.lastName,
			priorities.name
		)
		.orderBy(sql`MAX(${schedules.scheduledAt}) DESC`);

	const data: ScheduleTrackerRow[] = rows.map((r) => {
		const done = Number(r.done ?? 0);
		const total = Number(r.total ?? 0);
		const open = Math.max(total - done, 0);
		const percent = total > 0 ? Math.round((done / total) * 100) : 0;
		return {
			id: r.id,
			scheduledAt: r.scheduledAt as unknown as string,
			notes: r.notes ?? null,
			client: r.client,
			location: r.location,
			technician: r.technician,
			priority: r.priority,
			total,
			done,
			open,
			percent,
		};
	});

	return NextResponse.json({ data });
}
