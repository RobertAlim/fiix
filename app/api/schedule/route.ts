// app/api/schedule-maintenance/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db"; // Adjust this path to your Drizzle client setup
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import {
	schedules,
	scheduleDetails,
	users,
	clients,
	locations,
	priorities,
	printers,
	deployments,
	models,
	departments,
	maintain,
	status,
} from "@/db/schema"; // Adjust this path to your Drizzle schema
import { format } from "date-fns";
import { ensureError } from "@/lib/errors";
import { convertToPhilippineTimezone } from "@/lib/dateConverter";
import { requireRole } from "@/lib/require-role";

// Define the expected structure of the incoming request body
interface ScheduleMaintenancePayload {
	technicianId: string;
	clientId: string;
	locationId: string;
	priority: string;
	notes?: string;
	maintainAll: boolean;
	scheduleDate: Date; // Assuming YYYY-MM-DD string
	scheduleId?: number; // Optional, for updates
	added: { printerId: number; mtId: number }[]; // Array of added printers
	removed: { printerId: number; mtId: number }[]; // Array of removed printers
	actions: string; // Action to be performed, e.g., "Add Schedule" or "Update Schedule"
}

export async function POST(req: NextRequest) {
	const authResult = await requireRole(["Admin", "Scheduler"]);
	if (authResult.error) return authResult.error;

	let newScheduleId: number | null = null;

	try {
		const payload: ScheduleMaintenancePayload = await req.json();

		const {
			technicianId,
			clientId,
			locationId,
			priority,
			notes,
			maintainAll,
			scheduleDate,
			scheduleId,
			added,
			removed,
			actions,
		} = payload;

		// --- 1. Basic Validation ---
		if (
			!technicianId ||
			!clientId ||
			!locationId ||
			priority === null ||
			!scheduleDate
		) {
			return NextResponse.json(
				{ message: "Missing required fields or no printers selected." },
				{ status: 400 }
			);
		}

		// A printer submitted twice in the same request would otherwise create
		// two identical scheduleDetails rows for one schedule.
		if (added?.length > 0) {
			const seen = new Set<number>();
			const dupes = new Set<number>();
			for (const p of added) {
				if (seen.has(p.printerId)) dupes.add(p.printerId);
				seen.add(p.printerId);
			}
			if (dupes.size > 0) {
				return NextResponse.json(
					{
						message:
							"The same printer was selected more than once for this schedule.",
					},
					{ status: 400 }
				);
			}
		}

		if (actions === "Add Schedule") {
			// scheduleDate arrives over JSON as whatever the client sent — never
			// trust it's already a valid Date-parseable value. Coerce and
			// validate explicitly so a bad value gets a clear 400 instead of an
			// opaque "Invalid time value" crash from date-fns.
			const parsedScheduleDate = new Date(scheduleDate);
			if (isNaN(parsedScheduleDate.getTime())) {
				return NextResponse.json(
					{ message: "Invalid schedule date." },
					{ status: 400 }
				);
			}

			// --- 2. Insert the main maintenance schedule record ---
			const dateToSave = convertToPhilippineTimezone(parsedScheduleDate);
			const scheduledAtStr = format(parsedScheduleDate, "yyyy-MM-dd");

			// Check for a duplicate ourselves rather than relying on
			// onConflictDoNothing, which requires a matching unique index in
			// the database — one was never actually created here, so that
			// approach silently fails with "no unique or exclusion
			// constraint matching the ON CONFLICT specification".
			const existing = await db.query.schedules.findFirst({
				where: and(
					eq(schedules.technicianId, Number(technicianId)),
					eq(schedules.clientId, Number(clientId)),
					eq(schedules.locationId, Number(locationId)),
					eq(schedules.scheduledAt, scheduledAtStr)
				),
			});

			if (existing) {
				return NextResponse.json(
					{ error: "duplicate", existing },
					{ status: 409 }
				);
			}

			const [newSchedule] = await db
				.insert(schedules)
				.values({
					technicianId: Number(technicianId),
					clientId: Number(clientId),
					locationId: Number(locationId),
					priority: Number(priority),
					notes: notes,
					maintainAll,
					scheduledAt: dateToSave,
					// createdAt and updatedAt will be defaultNow() from schema
				})
				.returning({ id: schedules.id }); // Get the ID of the newly inserted schedule

			if (!newSchedule) {
				return NextResponse.json(
					{ message: "Failed to create schedule." },
					{ status: 500 }
				);
			}

			newScheduleId = newSchedule.id;

			// Attach any printers selected at creation time immediately,
			// instead of leaving a brand-new schedule empty until the user
			// happens to click Update again — same duplicate-guard as the
			// update path below.
			if (added.length > 0) {
				// A printer can only be in one place at a time, so it can never be
				// scheduled twice for the same date — regardless of client. Checked
				// across ALL schedules for this date, not just this client's.
				const conflicting = await db
					.select({
						printerId: scheduleDetails.printerId,
						serialNo: printers.serialNo,
					})
					.from(scheduleDetails)
					.innerJoin(schedules, eq(schedules.id, scheduleDetails.scheduleId))
					.innerJoin(printers, eq(printers.id, scheduleDetails.printerId))
					.where(
						and(
							eq(schedules.scheduledAt, dateToSave),
							inArray(
								scheduleDetails.printerId,
								added.map((p) => p.printerId)
							),
							sql`${scheduleDetails.scheduleId} != ${newScheduleId}`
						)
					);

				if (conflicting.length > 0) {
					const serials = conflicting.map((c) => c.serialNo).join(", ");
					return NextResponse.json(
						{
							message: `Printer(s) ${serials} ${
								conflicting.length === 1 ? "is" : "are"
							} already scheduled for ${scheduledAtStr} on a different schedule.`,
						},
						{ status: 409 }
					);
				}

				await db.insert(scheduleDetails).values(
					added.map((printer) => ({
						scheduleId: newScheduleId!,
						printerId: printer.printerId,
						originMTId: printer.mtId,
					}))
				);
			}
		} else {
			const [updatedSchedule] = await db
				.update(schedules)
				.set({
					priority: Number(priority),
					notes: notes,
					maintainAll,
				})
				.where(eq(schedules.id, scheduleId!)) // change `schedules.id` to your actual key
				.returning({ id: schedules.id, scheduledAt: schedules.scheduledAt });

			newScheduleId = updatedSchedule.id;

			// --- 3. Prepare and Insert associated printers ---
			if (added.length > 0) {
				// A printer can only be in one place at a time, so it can never be
				// scheduled twice for the same date — regardless of client. Checked
				// across ALL schedules for this date (excluding this schedule
				// itself, so re-saving its own existing printers isn't a conflict).
				const conflicting = await db
					.select({
						printerId: scheduleDetails.printerId,
						serialNo: printers.serialNo,
					})
					.from(scheduleDetails)
					.innerJoin(schedules, eq(schedules.id, scheduleDetails.scheduleId))
					.innerJoin(printers, eq(printers.id, scheduleDetails.printerId))
					.where(
						and(
							eq(schedules.scheduledAt, updatedSchedule.scheduledAt),
							inArray(
								scheduleDetails.printerId,
								added.map((p) => p.printerId)
							),
							sql`${scheduleDetails.scheduleId} != ${newScheduleId}`
						)
					);

				if (conflicting.length > 0) {
					const serials = conflicting.map((c) => c.serialNo).join(", ");
					const dateLabel = format(
						new Date(updatedSchedule.scheduledAt),
						"yyyy-MM-dd"
					);
					return NextResponse.json(
						{
							message: `Printer(s) ${serials} ${
								conflicting.length === 1 ? "is" : "are"
							} already scheduled for ${dateLabel} on a different schedule.`,
						},
						{ status: 409 }
					);
				}

				const printersToAdd = added.map((printer) => ({
					scheduleId: newScheduleId!, // Use the ID from the first insert
					printerId: printer.printerId,
					originMTId: printer.mtId,
				}));

				await db.insert(scheduleDetails).values(printersToAdd);
			}

			if (removed.length > 0) {
				await db.delete(scheduleDetails).where(
					and(
						eq(scheduleDetails.scheduleId, newScheduleId),
						inArray(
							scheduleDetails.printerId,
							removed.map((p) => p.printerId)
						)
					)
				);
			}
		}

		// If both inserts succeed, return success
		return NextResponse.json(
			{
				message: "Maintenance schedule created successfully.",
				scheduleId: newScheduleId,
			},
			{ status: 201 }
		);
	} catch (error: unknown) {
		const err = ensureError(error);
		console.error("Error creating maintenance schedule:", err.message);

		// More specific error handling could be added here,
		// e.g., checking for unique constraint violations if you had them.
		return NextResponse.json(
			{ message: err.message || "Internal server error." },
			{ status: 500 }
		);
	}
}

export async function GET(req: Request) {
	// This endpoint serves two different consumers: the Schedule page
	// (pageSource set, Scheduler/Admin only) and the Dashboard's "my
	// itinerary today" widget used by every role, including Technician —
	// so the role check has to branch rather than apply one rule to both.
	const { searchParams } = new URL(req.url);
	const pageSource = searchParams.get("pageSource");

	const authResult = await requireRole(
		pageSource ? ["Admin", "Scheduler"] : ["Admin", "Scheduler", "Technician"]
	);
	if (authResult.error) return authResult.error;

	if (pageSource) {
		//Schedules in Schedule Page

		const technicianIdParam = searchParams.get("technicianId");
		const scheduledAtParam = searchParams.get("scheduledAt");

		const technicianId = Number(technicianIdParam);
		const scheduledAt = format(new Date(scheduledAtParam!), "yyyy-MM-dd");

		if (technicianId === 0 || scheduledAt === null) {
			return NextResponse.json({ status: 200 });
		}

		try {
			const data = await db
				.select({
					id: schedules.id,
					technicianId: schedules.technicianId,
					technician: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
					clientId: clients.id,
					client: clients.name,
					locationId: locations.id,
					location: locations.name,
					priorityId: priorities.id,
					priority: priorities.name,
					notes: schedules.notes,
					maintainAll: schedules.maintainAll,
					scheduleAt:
						sql<string>`to_char(${schedules.scheduledAt}, 'MM/DD/YYYY')`.as(
							"date"
						),
				})
				.from(schedules)
				.innerJoin(users, eq(schedules.technicianId, users.id))
				.innerJoin(clients, eq(schedules.clientId, clients.id))
				.innerJoin(locations, eq(schedules.locationId, locations.id))
				.innerJoin(priorities, eq(schedules.priority, priorities.id))
				.where(
					and(
						eq(schedules.technicianId, technicianId),
						eq(schedules.scheduledAt, scheduledAt)
					)
				)
				.orderBy(desc(priorities.id));

			if (data.length === 0) {
				return NextResponse.json(
					{
						message: "No schedules",
					},
					{ status: 200 }
				);
			}

			return NextResponse.json(data, { status: 200 });
		} catch (error) {
			console.error("Error fetching schedule data:", error);
			return NextResponse.json(
				{ error: "Failed to retrieve schedule data due to a server error." },
				{ status: 500 }
			);
		}
	} else {
		//Schedules in Dashboard Page
		const technicianId = searchParams.get("technicianId");
		const scheduledAt = searchParams.get("scheduledAt");

		try {
			const conditions = [];
			if (technicianId) {
				conditions.push(eq(schedules.technicianId, parseInt(technicianId)));
			}
			if (scheduledAt) {
				conditions.push(eq(schedules.scheduledAt, scheduledAt));
			}
			const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

			// NOTE: this used to go through db.query.schedules.findMany({ with: ... }),
			// but that relies on the schema's relations() config, and the
			// "printer" relation there is mistakenly bound to the deployments
			// table instead of printers — resolving printer.model /
			// printer.department then crashes with "Cannot read properties of
			// undefined (reading 'referencedTable')". Manual joins below sidestep
			// that broken metadata entirely (same pattern already used by most
			// other routes in this app) and also correctly source model/department
			// via the printer's active deployment, since printers itself no longer
			// carries those columns after the deployments split.
			const scheduleRows = await db
				.select({
					id: schedules.id,
					technicianId: schedules.technicianId,
					clientId: schedules.clientId,
					locationId: schedules.locationId,
					priority: schedules.priority,
					notes: schedules.notes,
					maintainAll: schedules.maintainAll,
					scheduledAt: schedules.scheduledAt,
					createdAt: schedules.createdAt,
					technicianFirstName: users.firstName,
					technicianLastName: users.lastName,
					clientName: clients.name,
					locationName: locations.name,
					priorityName: priorities.name,
				})
				.from(schedules)
				.innerJoin(users, eq(users.id, schedules.technicianId))
				.innerJoin(clients, eq(clients.id, schedules.clientId))
				.innerJoin(locations, eq(locations.id, schedules.locationId))
				.innerJoin(priorities, eq(priorities.id, schedules.priority))
				.where(whereClause);

			if (scheduleRows.length === 0) {
				return NextResponse.json([]);
			}

			const scheduleIds = scheduleRows.map((s) => s.id);

			const detailRows = await db
				.select({
					id: scheduleDetails.id,
					scheduleId: scheduleDetails.scheduleId,
					printerId: scheduleDetails.printerId,
					originMTId: scheduleDetails.originMTId,
					isMaintained: scheduleDetails.isMaintained,
					maintainedDate: scheduleDetails.maintainedDate,
					printerSerialNo: printers.serialNo,
					modelId: deployments.modelId,
					modelName: models.name,
					departmentId: deployments.departmentId,
					departmentName: departments.name,
					maintainNotes: maintain.notes,
					maintainSignPath: maintain.signPath,
					maintainStatusName: status.name,
				})
				.from(scheduleDetails)
				.innerJoin(printers, eq(printers.id, scheduleDetails.printerId))
				.leftJoin(
					deployments,
					and(eq(deployments.printerId, printers.id), eq(deployments.deployedHere, true))
				)
				.leftJoin(models, eq(models.id, deployments.modelId))
				.leftJoin(departments, eq(departments.id, deployments.departmentId))
				.leftJoin(maintain, eq(maintain.id, scheduleDetails.originMTId))
				.leftJoin(status, eq(status.id, maintain.statusId))
				.where(inArray(scheduleDetails.scheduleId, scheduleIds));

			const detailsBySchedule = new Map<number, typeof detailRows>();
			for (const row of detailRows) {
				const list = detailsBySchedule.get(row.scheduleId) ?? [];
				list.push(row);
				detailsBySchedule.set(row.scheduleId, list);
			}

			const fetchedSchedules = scheduleRows.map((s) => ({
				id: s.id,
				technicianId: s.technicianId,
				clientId: s.clientId,
				locationId: s.locationId,
				priority: s.priority,
				notes: s.notes,
				maintainAll: s.maintainAll,
				scheduledAt: s.scheduledAt,
				createdAt: s.createdAt,
				technician: { firstName: s.technicianFirstName, lastName: s.technicianLastName },
				client: { name: s.clientName },
				location: { name: s.locationName },
				priorityLevel: { name: s.priorityName },
				scheduleDetails: (detailsBySchedule.get(s.id) ?? []).map((d) => ({
					id: d.id,
					scheduleId: d.scheduleId,
					printerId: d.printerId,
					originMTId: d.originMTId,
					isMaintained: d.isMaintained,
					maintainedDate: d.maintainedDate,
					printer: {
						id: d.printerId,
						serialNo: d.printerSerialNo,
						model: { name: d.modelName },
						department: { name: d.departmentName },
					},
					maintainRecord: d.originMTId
						? {
								id: d.originMTId,
								notes: d.maintainNotes,
								signPath: d.maintainSignPath,
								status: { name: d.maintainStatusName },
						  }
						: null,
				})),
			}));

			return NextResponse.json(fetchedSchedules);
		} catch (error) {
			console.error("Error fetching schedules:", error);
			return NextResponse.json(
				{ error: "Failed to fetch schedules" },
				{ status: 500 }
			);
		}
	}
}

export async function DELETE(req: NextRequest) {
	const authResult = await requireRole(["Admin", "Scheduler"]);
	if (authResult.error) return authResult.error;

	const { searchParams } = new URL(req.url);
	const scheduleId = searchParams.get("scheduleId");

	// Basic validation
	if (!scheduleId) {
		return NextResponse.json(
			{ message: "Schedule ID is required." },
			{ status: 400 }
		);
	}
	const scheduleIdNum = parseInt(scheduleId);
	if (isNaN(scheduleIdNum)) {
		return NextResponse.json(
			{ message: "Invalid Schedule ID provided." },
			{ status: 400 }
		);
	}

	try {
		// Step 1: Check for existing maintained records
		const maintainedRecords = await db
			.select()
			.from(scheduleDetails)
			.where(
				and(
					eq(scheduleDetails.scheduleId, scheduleIdNum),
					eq(scheduleDetails.isMaintained, true)
				)
			)
			.limit(1);

		if (maintainedRecords.length > 0) {
			return NextResponse.json(
				{
					message:
						"Cannot delete schedule. Some tasks have already been completed.",
				},
				{ status: 403 }
			);
		}

		// Step 2: Proceed with deletion if no maintained records are found
		// First, delete related entries in the scheduleDetails table.
		await db
			.delete(scheduleDetails)
			.where(eq(scheduleDetails.scheduleId, scheduleIdNum));

		// Then, delete the main entry in the schedules table.
		await db.delete(schedules).where(eq(schedules.id, scheduleIdNum));

		return NextResponse.json(
			{ message: "Schedule and associated details deleted successfully." },
			{ status: 200 }
		);
	} catch (error: unknown) {
		const err = ensureError(error);
		console.error("Error deleting scheduledsfadf:", err.message);
		return NextResponse.json(
			{ message: "Failed to delete schedule." },
			{ status: 500 }
		);
	}
}
