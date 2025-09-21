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
} from "@/db/schema"; // Adjust this path to your Drizzle schema
import { format } from "date-fns";
import { ensureError } from "@/lib/errors";

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

		if (actions === "Add Schedule") {
			// --- 2. Insert the main maintenance schedule record ---
			const dateToSave = format(new Date(scheduleDate), "MM/dd/yyyy");
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
				.onConflictDoNothing({
					target: [
						schedules.technicianId,
						schedules.clientId,
						schedules.locationId,
						schedules.scheduledAt,
					],
				})
				.returning({ id: schedules.id }); // Get the ID of the newly inserted schedule

			if (!newSchedule) {
				// Duplicate: fetch existing (optional, nice for UX)
				const existing = await db.query.schedules.findFirst({
					where: and(
						eq(schedules.clientId, Number(clientId)),
						eq(schedules.locationId, Number(locationId)),
						eq(schedules.scheduledAt, format(scheduleDate, "yyyy-MM-dd"))
					),
				});

				return NextResponse.json(
					{ error: "duplicate", existing },
					{ status: 409 }
				);
			}

			newScheduleId = newSchedule.id;
		} else {
			const [updatedSchedule] = await db
				.update(schedules)
				.set({
					priority: Number(priority),
					notes: notes,
					maintainAll,
				})
				.where(eq(schedules.id, scheduleId!)) // change `schedules.id` to your actual key
				.returning({ id: schedules.id });

			newScheduleId = updatedSchedule.id;

			// --- 3. Prepare and Insert associated printers ---
			if (added.length > 0) {
				const printersToAdd = added.map((printer) => ({
					scheduleId: newScheduleId!, // Use the ID from the first insert
					printerId: printer.printerId,
					mtId: printer.mtId,
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
	const { searchParams } = new URL(req.url);
	const pageSource = searchParams.get("pageSource");

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

			const fetchedSchedules = await db.query.schedules.findMany({
				where: conditions.length > 0 ? and(...conditions) : undefined,
				with: {
					technician: { columns: { firstName: true, lastName: true } },
					client: { columns: { name: true } },
					location: { columns: { name: true } },
					priorityLevel: { columns: { name: true } },
					scheduleDetails: {
						with: {
							printer: {
								with: {
									model: { columns: { name: true } },
									department: { columns: { name: true } },
								},
								columns: {
									id: true,
									serialNo: true,
								},
							},
							maintainRecord: {
								with: {
									status: { columns: { name: true } },
								},
								columns: {
									id: true,
									notes: true,
								},
							},
						},
						columns: {
							id: true,
							scheduleId: true,
							originMTId: true,
							isMaintained: true,
							maintainedDate: true,
						},
					},
				},
			});

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
