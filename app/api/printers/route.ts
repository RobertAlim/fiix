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
	deployments,
} from "@/db/schema";
import { eq, sql, and, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/require-role";

export async function GET(req: Request) {
	const authResult = await requireActiveUser();
	if (authResult.error) return authResult.error;

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

		// `scheduleDetails.printerId` should be unique within one schedule —
		// a printer only needs to appear once per visit — but the write side
		// (app/api/schedule/route.ts's create/edit flow) has been seen to
		// insert it twice for the same schedule (the same class of issue as
		// the `scheduleDetails.originMTId` duplication fixed in pending-
		// maintenance and schedule/assign). A plain LEFT JOIN on printerId
		// here would duplicate that printer's row — since this list is keyed
		// by printer.id, that's exactly a React "two children with the same
		// key" crash. Deduplicated here defensively, same as the
		// `deployedHere` fix directly below.
		const scheduleDetailsData = db.$with("scheduleDetails").as(
			db
				.selectDistinctOn([scheduleDetails.printerId], {
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
				.orderBy(scheduleDetails.printerId, desc(scheduleDetails.id))
		);

		const latestMaintain = db.$with("latestMaintain").as(
			db
				.selectDistinctOn([deployments.printerId], {
					mtId: maintain.id,
					printerId: deployments.printerId,
					statusName: status.name,
					notes: maintain.notes,
					createdAt: maintain.createdAt,
				})
				.from(maintain)
				.innerJoin(deployments, eq(maintain.deploymentId, deployments.id))
				.innerJoin(printers, eq(printers.id, deployments.printerId))
				.innerJoin(status, eq(maintain.statusId, status.id))
				.orderBy(
					deployments.printerId,
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
				.from(deployments)
				.innerJoin(printers, eq(printers.id, deployments.printerId))
				.innerJoin(models, eq(deployments.modelId, models.id))
				.innerJoin(clients, eq(deployments.clientId, clients.id))
				.innerJoin(locations, eq(deployments.locationId, locations.id))
				.innerJoin(departments, eq(deployments.departmentId, departments.id))
				.leftJoin(latestMaintain, eq(printers.id, latestMaintain.printerId))
				.leftJoin(
					scheduleDetailsData,
					eq(printers.id, scheduleDetailsData.printerId)
				)
				.where(
					and(
						eq(deployments.clientId, clientId),
						eq(deployments.locationId, locationId),
						// Printer Transfer (see /api/admin/master/printers/[id]/transfer)
						// retires the old deployment row rather than deleting it, so
						// history is preserved — but that means a printer transferred
						// AWAY from this client/location and later back TO it again
						// has more than one deployments row matching the clientId/
						// locationId filter above. Without this, that printer's id
						// appears twice in the result: once per matching deployment
						// row, all joined against the same printers.id — which is
						// exactly the "two children with the same key" React error,
						// since the UI keys this list by printer.id.
						eq(deployments.deployedHere, true)
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
						sql<string>`to_char(${deployments.deploymentDate}, 'MM/DD/YYYY')`.as(
							"deploymentDate"
						),
					deployedClient: deployedClient.name,
					serialNo: printers.serialNo,
				})
				.from(deployments)
				.innerJoin(printers, eq(printers.id, deployments.printerId))
				.innerJoin(models, eq(deployments.modelId, models.id))
				.innerJoin(clients, eq(deployments.clientId, clients.id))
				.innerJoin(locations, eq(deployments.locationId, locations.id))
				.innerJoin(departments, eq(deployments.departmentId, departments.id))
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
