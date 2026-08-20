// app/api/unmaintained-printers/route.ts
//
// Replaces the old itinerary-based "Missed Schedules" concept on the
// Schedule page with a purely maintenance-date-driven one: any currently
// deployed printer whose LATEST maintenance record (across its entire
// history, any past deployment — not just the current site) is 7+ days
// old, or that has never been maintained at all. Nothing here depends on
// schedules, scheduleDetails, or missed itinerary rows — a printer drops
// off this list the moment a new maintenance report is filed for it,
// automatically, with no separate "resolve" step (see the request: "If it
// is maintained on the 11th day → automatically remove it from the list").
//
// "Today" and every day-difference below are computed in Asia/Manila
// inside Postgres, same convention as the rest of this app's date logic —
// a server running in UTC would otherwise flip a printer's overdue count
// several hours early/late around midnight Manila time.
import { db } from "@/db";
import {
	printers,
	deployments,
	clients,
	locations,
	models,
	maintain,
} from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/require-role";

const MIN_OVERDUE_DAYS = 7;

export async function GET() {
	const authResult = await requireRole(["Admin", "Scheduler"]);
	if (authResult.error) return authResult.error;

	// Latest maintenance record per printer, across EVERY deployment it's
	// ever had — a printer transferred to a new client doesn't get its
	// overdue clock reset by the transfer itself, only by an actual visit.
	const latestMaintain = db.$with("latest_maintain_by_printer").as(
		db
			.selectDistinctOn([deployments.printerId], {
				printerId: deployments.printerId,
				createdAt: maintain.createdAt,
			})
			.from(maintain)
			.innerJoin(deployments, eq(maintain.deploymentId, deployments.id))
			.orderBy(deployments.printerId, desc(maintain.createdAt), desc(maintain.id))
	);

	// The printer's CURRENT deployment. This should always be at most one
	// row per printer (deployedHere: true is meant to be exclusive — see
	// the Transfer route, which retires the old one before inserting a
	// new one) — but a stray duplicate has shown up in production at
	// least once, and an INNER JOIN straight to `deployments` on just
	// `deployedHere = true` silently turns that into a duplicated output
	// row (same printerId twice), which is what was crashing this page
	// with a React "duplicate key" error. This makes the query itself
	// hold the invariant — deterministically picking the most-recently-
	// created deployedHere row — rather than trusting the data to already
	// be clean.
	const currentDeployment = db.$with("current_deployment").as(
		db
			.selectDistinctOn([deployments.printerId], {
				printerId: deployments.printerId,
				clientId: deployments.clientId,
				locationId: deployments.locationId,
				modelId: deployments.modelId,
				deploymentDate: deployments.deploymentDate,
			})
			.from(deployments)
			.where(eq(deployments.deployedHere, true))
			.orderBy(deployments.printerId, desc(deployments.id))
	);

	// Days since the reference point (latest maintenance, or — for a
	// printer that's never been serviced at all — its deployment date) up
	// to today, both sides computed as Manila-local dates so the
	// subtraction is a plain integer day count.
	const daysSince = sql<number>`(
		(now() AT TIME ZONE 'Asia/Manila')::date
		- COALESCE(
			(${latestMaintain.createdAt} AT TIME ZONE 'Asia/Manila')::date,
			${currentDeployment.deploymentDate}
		)
	)`;

	const rows = await db
		.with(latestMaintain, currentDeployment)
		.select({
			printerId: printers.id,
			serialNo: printers.serialNo,
			model: models.name,
			clientId: clients.id,
			client: clients.name,
			locationId: locations.id,
			location: locations.name,
			lastMaintainedAt: latestMaintain.createdAt,
			daysSinceMaintenance: daysSince,
		})
		.from(printers)
		.innerJoin(currentDeployment, eq(currentDeployment.printerId, printers.id))
		.innerJoin(clients, eq(clients.id, currentDeployment.clientId))
		.innerJoin(locations, eq(locations.id, currentDeployment.locationId))
		.innerJoin(models, eq(models.id, currentDeployment.modelId))
		.leftJoin(latestMaintain, eq(latestMaintain.printerId, printers.id))
		.where(sql`${daysSince} >= ${MIN_OVERDUE_DAYS}`)
		.orderBy(desc(daysSince));

	return NextResponse.json(
		rows.map((r) => ({
			...r,
			lastMaintainedAt: r.lastMaintainedAt
				? new Date(r.lastMaintainedAt).toISOString()
				: null,
		}))
	);
}
