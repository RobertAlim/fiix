// app/api/dashboard-stats/route.ts
// Aggregate KPIs for the dashboard overview: total deployed printers,
// maintenance completed this month, outstanding schedule items, and
// upcoming (not-yet-passed) schedules — plus a 7-day completed-maintenance
// trend for the overview chart.
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import {
	deployments,
	maintain,
	scheduleDetails,
	schedules,
} from "@/db/schema";
import { NextResponse } from "next/server";

export async function GET() {
	const { userId } = await auth();
	if (!userId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const [totalPrintersRow] = await db
		.select({ count: sql<number>`COUNT(*)` })
		.from(deployments)
		.where(sql`${deployments.deployedHere} = true`);

	const [completedThisMonthRow] = await db
		.select({ count: sql<number>`COUNT(*)` })
		.from(maintain)
		.where(sql`date_trunc('month', ${maintain.createdAt}) = date_trunc('month', now())`);

	const [pendingRow] = await db
		.select({ count: sql<number>`COUNT(*)` })
		.from(scheduleDetails)
		.where(sql`${scheduleDetails.isMaintained} = false`);

	const [upcomingRow] = await db
		.select({ count: sql<number>`COUNT(DISTINCT ${schedules.id})` })
		.from(schedules)
		.where(sql`${schedules.scheduledAt} >= CURRENT_DATE`);

	const trend = await db
		.select({
			day: sql<string>`to_char(${maintain.createdAt}::date, 'Dy')`.as("day"),
			date: sql<string>`${maintain.createdAt}::date`.as("date"),
			completed: sql<number>`COUNT(*)`.as("completed"),
		})
		.from(maintain)
		.where(sql`${maintain.createdAt} >= CURRENT_DATE - INTERVAL '6 days'`)
		.groupBy(sql`${maintain.createdAt}::date`)
		.orderBy(sql`${maintain.createdAt}::date`);

	return NextResponse.json({
		totalPrinters: Number(totalPrintersRow?.count ?? 0),
		completedThisMonth: Number(completedThisMonthRow?.count ?? 0),
		pending: Number(pendingRow?.count ?? 0),
		upcomingSchedules: Number(upcomingRow?.count ?? 0),
		trend: trend.map((t) => ({ day: t.day, completed: Number(t.completed) })),
	});
}
