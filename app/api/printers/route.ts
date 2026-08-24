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
	users,
} from "@/db/schema";
import { eq, sql, and, ne, desc } from "drizzle-orm";
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
		//
		// NOTE: this CTE is intentionally NOT named "scheduleDetails" (even
		// though the variable holding it is `scheduleDetailsData`) — it used
		// to be, and that collided with the real `scheduleDetails` table.
		// A CTE is visible to every CTE defined after it in the same WITH
		// list, so once the `otherAssignment` CTE below was added — which
		// itself needs to select FROM the real `scheduleDetails` table —
		// Postgres resolved that unqualified reference to THIS CTE instead
		// of the real table (same name, defined first, so it wins). This
		// CTE's columns (id/printerId/isMaintained/maintainedDate renamed to
		// schedId/printerId/isMaintained/maintained_date) don't include
		// `scheduleId`, so the otherAssignment CTE's join condition
		// (`scheduleDetails.scheduleId`) failed with "column ... does not
		// exist" — a 500 on every request that reached this code path (i.e.
		// every click on a printer itinerary, since scheduleId is always set
		// there). Giving this CTE a distinct SQL name fixes it.
		const scheduleDetailsData = db.$with("scheduleDetailsCte").as(
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

		// Multi-technician/client scheduling: two technicians can now both
		// have a schedule for the SAME client on the SAME date (see
		// app/api/schedule/exists/route.ts, which used to block that by
		// matching on client+location+date alone, ignoring technician). A
		// printer, though, can still only be double-booked if it's already
		// on a DIFFERENT TECHNICIAN's schedule that day — the save-time
		// guard in app/api/schedule/route.ts enforces exactly that (see the
		// comments there), but without this the Scheduler had no way to SEE
		// it before hitting that 409 on save. This looks up which OTHER
		// TECHNICIAN'S schedule (same date, excluding this technician's own
		// schedules) already has each printer, so the UI can show "Assigned
		// to <technician>" and disable it up front instead of only failing
		// late at save time.
		let targetScheduledAt: string | null = null;
		let targetTechnicianId: number | null = null;
		if (scheduleId) {
			const [targetSchedule] = await db
				.select({
					scheduledAt: schedules.scheduledAt,
					technicianId: schedules.technicianId,
				})
				.from(schedules)
				.where(eq(schedules.id, scheduleId))
				.limit(1);
			targetScheduledAt = targetSchedule?.scheduledAt ?? null;
			targetTechnicianId = targetSchedule?.technicianId ?? null;
		}

		const otherAssignment =
			targetScheduledAt && targetTechnicianId != null
				? db.$with("otherAssignment").as(
						db
							.selectDistinctOn([scheduleDetails.printerId], {
								printerId: scheduleDetails.printerId,
								technicianId: schedules.technicianId,
								// Raw `sql` fields selected from a subquery/CTE must carry an
								// explicit alias — without `.as(...)` Drizzle has no column
								// name to reference when the OUTER query later does
								// `otherAssignment.technicianName`, and throws at request time
								// (not at compile time, since this is only checked when the
								// field is actually referenced). This is what caused the 500
								// here even after the earlier CTE-name-collision fix.
								technicianName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`.as(
									"technician_name"
								),
							})
							.from(scheduleDetails)
							.innerJoin(schedules, eq(schedules.id, scheduleDetails.scheduleId))
							.innerJoin(users, eq(users.id, schedules.technicianId))
							.where(
								and(
									eq(schedules.scheduledAt, targetScheduledAt),
									// Excluding by TECHNICIAN rather than by this one
									// schedule id: this technician can legitimately hold
									// more than one schedule for this date (a different
									// client/location, or the schedule currently being
									// edited itself), and none of those are a real
									// conflict. Only a genuinely different technician
									// already holding the printer that day counts — this
									// mirrors the same fix applied to the save-time check
									// in app/api/schedule/route.ts, so the badge shown
									// here and what actually gets rejected on save always
									// agree.
									ne(schedules.technicianId, targetTechnicianId)
								)
							)
							.orderBy(scheduleDetails.printerId, desc(schedules.id))
				  )
				: null;

		try {
			const baseCtes = otherAssignment
				? [latestMaintain, scheduleDetailsData, otherAssignment]
				: [latestMaintain, scheduleDetailsData];

			let query = db
				.with(...baseCtes)
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
					// Null when this printer is free for this date, or already on
					// THIS schedule (self-matches are excluded by the `ne` above).
					assignedTechnicianId: otherAssignment
						? otherAssignment.technicianId
						: sql<number | null>`NULL`,
					assignedTechnicianName: otherAssignment
						? otherAssignment.technicianName
						: sql<string | null>`NULL`,
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
				.$dynamic();

			// Drizzle's $dynamic() builder has no `.if()` — the standard
			// pattern for a conditional join is to reassign the query
			// variable, guarded by a plain `if`, before chaining `.where()`.
			if (otherAssignment) {
				const oa = otherAssignment;
				query = query.leftJoin(oa, eq(printers.id, oa.printerId));
			}

			const data = await query
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
