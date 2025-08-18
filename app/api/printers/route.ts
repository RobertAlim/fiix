import { db } from "@/db";
import {
	printers,
	models,
	clients,
	locations,
	departments,
	maintain,
	status,
	schedules,
	scheduleDetails,
} from "@/db/schema";
import { eq, sql, and, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
	const { searchParams } = new URL(req.url);

	const serialNoParam = searchParams.get("serialNo");

	if (!serialNoParam) {
		//Data fetching is for Datatable inside the SchedulePage
		const clientIdParam = searchParams.get("clientId");
		const locationIdParam = searchParams.get("locationId");
		const scheduleIdParam = searchParams.get("scheduleId");

		const clientId = Number(clientIdParam);
		const locationId = Number(locationIdParam);
		const scheduleId = Number(scheduleIdParam);

		if (clientId === 0 || locationId === 0 || scheduleId === 0) {
			return NextResponse.json({ status: 200 });
		}

		if (isNaN(clientId) || isNaN(locationId) || isNaN(scheduleId)) {
			return NextResponse.json(
				{
					error:
						"Missing or invalid 'clientId' or 'locationId' or 'scheduleId' parameters.",
				},
				{ status: 400 }
			);
		}

		const scheduleDetailsData = db.$with("scheduleDetails").as(
			db
				.select({
					schedId: scheduleDetails.id,
					printerId: scheduleDetails.printerId,
					isMaintained: scheduleDetails.isMaintained,
					maintainedDate: sql<string>`
						TO_CHAR(${scheduleDetails.maintainedDate}, 'MM/DD/YYYY HH12:MI AM')`.as(
						"maintained_date"
					),
				})
				.from(schedules)
				.innerJoin(
					scheduleDetails,
					eq(schedules.id, scheduleDetails.scheduleId)
				)
				.where(
					and(
						eq(schedules.clientId, clientId),
						eq(schedules.locationId, locationId),
						eq(schedules.id, scheduleId)
					)
				)
		);

		const latestMaintain = db.$with("latestMaintain").as(
			db
				.selectDistinctOn([maintain.printerId], {
					mtId: maintain.id,
					printerId: maintain.printerId,
					statusName: status.name,
					notes: maintain.notes,
					createdAt: maintain.createdAt,
				})
				.from(maintain)
				.innerJoin(status, eq(maintain.statusId, status.id))
				.orderBy(
					maintain.printerId,
					desc(maintain.createdAt),
					desc(maintain.id)
				)
		);

		try {
			const data = await db
				.with(latestMaintain, scheduleDetailsData)
				.select({
					id: printers.id,
					department: departments.name,
					model: models.name,
					serialNo: printers.serialNo,
					status: latestMaintain.statusName,
					notes: latestMaintain.notes,
					lastMt: sql<string>`
				TO_CHAR(${latestMaintain.createdAt}, 'MM/DD/YYYY HH12:MI AM')`.as("last_mt"),
					mtId: latestMaintain.mtId,
					schedDetailsId: scheduleDetailsData.schedId,
					isMaintained: scheduleDetailsData.isMaintained,
					maintainedDate: scheduleDetailsData.maintainedDate,
					isToggled: sql`
				CASE 
					WHEN ${scheduleDetailsData.maintainedDate} IS NOT NULL OR ${scheduleDetailsData.schedId} IS NOT NULL 
					THEN TRUE
					ELSE FALSE
				END
				`.as("is_toggled"),
				})
				.from(printers)
				.innerJoin(models, eq(printers.modelId, models.id))
				.innerJoin(clients, eq(printers.clientId, clients.id))
				.innerJoin(locations, eq(printers.locationId, locations.id))
				.innerJoin(departments, eq(printers.departmentId, departments.id))
				.leftJoin(latestMaintain, eq(printers.id, latestMaintain.printerId))
				.leftJoin(
					scheduleDetailsData,
					eq(printers.id, scheduleDetailsData.printerId)
				)
				.where(
					and(
						eq(printers.clientId, clientId),
						eq(printers.locationId, locationId)
					)
				)
				.orderBy(scheduleDetailsData.schedId);

			if (data.length === 0) {
				return NextResponse.json([], { status: 200 });
			}

			return NextResponse.json(data, { status: 200 });
		} catch (error) {
			console.error("Error fetching printer data:", error);
			return NextResponse.json(
				{ error: "Failed to retrieve printer data due to a server error." },
				{ status: 500 }
			);
		}
	} else {
		//Data fetching is for the Modal for the Printer Details Information
		try {
			const deployedClient = alias(clients, "deployed_client");

			const data = await db
				.select({
					id: printers.id,
					client: clients.name,
					location: locations.name,
					department: departments.name,
					model: models.name,
					deploymentDate:
						sql<string>`to_char(${printers.deploymentDate}, 'MM/DD/YYYY')`.as(
							"deploymentDate"
						),
					deployedClient: deployedClient.name,
					serialNo: printers.serialNo,
				})
				.from(printers)
				.innerJoin(models, eq(printers.modelId, models.id))
				.innerJoin(clients, eq(printers.clientId, clients.id))
				.innerJoin(locations, eq(printers.locationId, locations.id))
				.innerJoin(departments, eq(printers.departmentId, departments.id))
				.innerJoin(
					deployedClient,
					eq(printers.deployedClient, deployedClient.id)
				)
				.where(and(eq(printers.serialNo, serialNoParam)))
				.orderBy(clients.name, departments.name);

			if (data.length === 0) {
				return NextResponse.json(
					{
						message: "No matching printers found for the given serial no.",
					},
					{ status: 404 }
				);
			}

			return NextResponse.json(data, { status: 200 });
		} catch (error) {
			console.error("Error fetching printer data:", error);
			return NextResponse.json(
				{ error: "Failed to retrieve printer data due to a server error." },
				{ status: 500 }
			);
		}
	}
}
