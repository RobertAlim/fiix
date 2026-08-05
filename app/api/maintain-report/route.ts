import { db } from "@/db";
import {
	maintain,
	users,
	status,
	printers,
	deployments,
	models,
	clients,
	locations,
	departments,
	maintenanceLocation,
} from "@/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/require-role";

export async function GET() {
	const authResult = await requireRole(["Admin", "Scheduler"]);
	if (authResult.error) return authResult.error;

	const data = await db
		.select({
			id: maintain.id,
			serialNo: printers.serialNo,
			client: clients.name,
			location: locations.name,
			department: departments.name,
			status: status.name,
			technician: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
			gpsLocation: maintenanceLocation.locationName,
			// createdAt is `timestamp` WITHOUT time zone holding UTC
			// wall-clock, so it has to be re-anchored to UTC before being
			// converted to Manila — a bare to_char() renders the UTC date,
			// which rolls backwards a day for anything logged before 8 AM.
			date: sql<string>`to_char(${maintain.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila', 'MM/DD/YYYY')`.as(
				"date"
			),
		})
		.from(maintain)
		.leftJoin(
			maintenanceLocation,
			eq(maintenanceLocation.maintenanceId, maintain.id)
		)
		.innerJoin(deployments, eq(deployments.id, maintain.deploymentId))
		.innerJoin(printers, eq(printers.id, deployments.printerId))
		.innerJoin(models, eq(deployments.modelId, models.id))
		.innerJoin(clients, eq(deployments.clientId, clients.id))
		.innerJoin(locations, eq(deployments.locationId, locations.id))
		.innerJoin(departments, eq(deployments.departmentId, departments.id))
		.innerJoin(status, eq(status.id, maintain.statusId))
		.innerJoin(users, eq(users.id, maintain.userId))
		.orderBy(desc(maintain.createdAt));

	if (!data) {
		return NextResponse.json(
			{ error: "No matching item found" },
			{ status: 404 }
		);
	}

	return NextResponse.json(data, { status: 200 });
}
