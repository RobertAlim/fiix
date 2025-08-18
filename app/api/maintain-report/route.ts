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
} from "@/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
	const data = await db
		.select({
			id: maintain.id,
			serialNo: printers.serialNo,
			client: clients.name,
			location: locations.name,
			department: departments.name,
			status: status.name,
			technician: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
			date: sql<string>`to_char(${maintain.createdAt}, 'MM/DD/YYYY')`.as(
				"date"
			),
		})
		.from(maintain)
		.innerJoin(printers, eq(printers.id, maintain.printerId))
		.innerJoin(models, eq(printers.modelId, models.id))
		.innerJoin(clients, eq(printers.clientId, clients.id))
		.innerJoin(locations, eq(printers.locationId, locations.id))
		.innerJoin(departments, eq(printers.departmentId, departments.id))
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
