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
import { eq, sql, desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/require-role";

export async function GET() {
	const authResult = await requireRole(["Admin", "Scheduler"]);
	if (authResult.error) return authResult.error;

	const data = await db
		.selectDistinctOn([printers.serialNo], {
			// <-- THIS IS THE KEY CHANGE for PostgreSQL
			id: maintain.id,
			serialNo: printers.serialNo,
			client: clients.name,
			location: locations.name,
			department: departments.name,
			model: models.name,
			status: status.name,
			technician: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
			date: sql<string>`to_char(${maintain.createdAt}, 'MM/DD/YYYY')`.as(
				"date"
			),
			createdAt: maintain.createdAt, // Crucial: must be selected and ordered for distinctOn to work correctly
			// notes: maintain.notes, // Uncomment if you have a 'notes' column in maintain table
		})
		.from(deployments)
		.innerJoin(printers, eq(printers.id, deployments.printerId))
		.innerJoin(models, eq(deployments.modelId, models.id))
		.innerJoin(clients, eq(deployments.clientId, clients.id))
		.innerJoin(locations, eq(deployments.locationId, locations.id))
		.innerJoin(departments, eq(deployments.departmentId, departments.id))
		.leftJoin(maintain, eq(deployments.id, maintain.deploymentId))
		.innerJoin(status, eq(status.id, maintain.statusId))
		.innerJoin(users, eq(users.id, maintain.userId))
		// .where(
		// 	inArray(status.name, [
		// 		"Replacement (Parts)",
		// 		"Replacement (Unit)",
		// 		"Pulled Out",
		// 		"For Replacement Printer Part",
		// 		"For Replacement of Printer",
		// 	])
		// )
		.orderBy(
			printers.serialNo,
			desc(maintain.createdAt) // Then, for each group, order by createdAt descending (latest first)
		);

	if (!data) {
		return NextResponse.json(
			{ error: "No matching item found" },
			{ status: 404 }
		);
	}

	return NextResponse.json(data, { status: 200 });
}
