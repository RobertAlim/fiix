// app/api/schedule-maintenance/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db"; // Adjust this path to your Drizzle client setup
import { eq, and, sql, asc, inArray } from "drizzle-orm";
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
	// "Add Schedule" | "Update Schedule" | "Reschedule".
	// "Reschedule" comes from the Reschedule action on a missed visit and is
	// handled as a CREATE, not an update — see the branch below.
	actions: string;
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

		// Reschedule creates a brand-new schedule just like "Add Schedule",
		// with two differences handled inside the branch: the
		// technician/client/location/date duplicate check is skipped, and the
		// new row carries a back-pointer to the schedule it replaces.
		const isReschedule = actions === "Reschedule";

		if (actions === "Add Schedule" || isReschedule) {
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
			//
			// Both the duplicate-schedule check below and the actual insert
			// MUST derive from the exact same calendar date, or they can
			// silently disagree. That's exactly what was happening here:
			// this used to compute two DIFFERENT strings from the same
			// input — `dateToSave` via convertToPhilippineTimezone
			// (Asia/Manila) for the actual insert, but `scheduledAtStr` via
			// plain date-fns `format()` (the SERVER's local timezone, UTC on
			// Vercel) for the duplicate check and every user-facing message.
			//
			// A Scheduler in Manila picking a date in the UI sends a Date
			// whose JSON-serialized instant is often still the PREVIOUS
			// day in UTC (e.g. picking Aug 15 in Manila, UTC+8, serializes
			// to "2026-08-14T16:00:00.000Z"). The UTC-formatted string is
			// then off by one calendar day from what's actually stored —
			// so a genuinely different date (e.g. Aug 16) could format to
			// the SAME string as an existing Aug 15 schedule's stored
			// value, tripping the duplicate guard on two schedules that
			// were never actually for the same day. Anchoring both to
			// Asia/Manila fixes both directions of that bug: legitimate
			// different-date schedules for the same technician/client/
			// location are no longer blocked, and a genuine same-day
			// duplicate is reliably caught.
			const scheduledAtStr = convertToPhilippineTimezone(
				parsedScheduleDate,
				"yyyy-MM-dd"
			);

			// Printers that will be attached to the new schedule. For a normal
			// creation these come from the form; for a reschedule the client
			// sends none and they're derived from the missed schedule instead,
			// below.
			// mtId is nullable here (unlike the form payload's type): a routine
			// schedule has no originating maintenance record to point back at.
			let printersToAttach: { printerId: number; mtId: number | null }[] =
				added ?? [];
			let rescheduledFromId: number | null = null;

			if (isReschedule) {
				if (!scheduleId) {
					return NextResponse.json(
						{ message: "Reschedule requires the original schedule id." },
						{ status: 400 }
					);
				}

				const [original] = await db
					.select({ id: schedules.id, scheduledAt: schedules.scheduledAt })
					.from(schedules)
					.where(eq(schedules.id, scheduleId))
					.limit(1);

				if (!original) {
					return NextResponse.json(
						{ message: "The schedule being rescheduled no longer exists." },
						{ status: 404 }
					);
				}

				rescheduledFromId = original.id;

				// Carry over only the work that never got done. A schedule can
				// be partially completed — the technician maintained three of
				// five printers before the day ran out — and re-booking the
				// finished ones would both duplicate history and put a printer
				// back on a route it doesn't need to be on.
				const outstanding = await db
					.select({
						printerId: scheduleDetails.printerId,
						originMTId: scheduleDetails.originMTId,
					})
					.from(scheduleDetails)
					.where(
						and(
							eq(scheduleDetails.scheduleId, original.id),
							eq(scheduleDetails.isMaintained, false)
						)
					);

				if (outstanding.length === 0) {
					return NextResponse.json(
						{
							message:
								"There is nothing left to reschedule — every printer on this schedule has already been maintained.",
						},
						{ status: 409 }
					);
				}

				printersToAttach = outstanding.map((d) => ({
					printerId: d.printerId,
					// Preserved so an issue-driven visit still points back at the
					// maintenance record that triggered it, across the reschedule.
					mtId: d.originMTId,
				}));
			}

			// Check for a duplicate ourselves rather than relying on
			// onConflictDoNothing, which requires a matching unique index in
			// the database — one was never actually created here, so that
			// approach silently fails with "no unique or exclusion
			// constraint matching the ON CONFLICT specification".
			//
			// Deliberately NOT run for a reschedule. A missed visit is very
			// often re-booked onto a day where that technician already has the
			// same client/location — that's the normal shape of catching up,
			// not a mistake, and blocking it is exactly the bug this branch
			// fixes. The guard still applies in full to ordinary creation.
			const existing = isReschedule
				? undefined
				: await db.query.schedules.findFirst({
						where: and(
							eq(schedules.technicianId, Number(technicianId)),
							eq(schedules.clientId, Number(clientId)),
							eq(schedules.locationId, Number(locationId)),
							eq(schedules.scheduledAt, scheduledAtStr)
						),
					});

			if (existing) {
				return NextResponse.json(
					{
						error: "duplicate",
						// The client's error handler only ever reads `.message` (see
						// createMaintenanceSchedule in Schedule.tsx) — without this
						// field it fell through to a generic "Failed to create
						// schedule." toast, hiding the actual, actionable reason.
						message: `A schedule already exists for this technician at this client/location on ${scheduledAtStr}. Edit that schedule instead of creating a new one, or pick a different date, technician, client, or location.`,
						existing,
					},
					{ status: 409 }
				);
			}

			// A printer can only be in one place at a time, so it can never be
			// scheduled twice for the same date — regardless of client. Checked
			// across ALL schedules for that date.
			//
			// Run BEFORE the schedule row is inserted: it used to run after,
			// which left an empty orphan schedule behind every time it tripped.
			if (printersToAttach.length > 0) {
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
							eq(schedules.scheduledAt, scheduledAtStr),
							inArray(
								scheduleDetails.printerId,
								printersToAttach.map((p) => p.printerId)
							)
						)
					);

				if (conflicting.length > 0) {
					const serials = [
						...new Set(conflicting.map((c) => c.serialNo)),
					].join(", ");
					return NextResponse.json(
						{
							message: `Printer(s) ${serials} ${
								conflicting.length === 1 ? "is" : "are"
							} already scheduled for ${scheduledAtStr} on a different schedule.`,
						},
						{ status: 409 }
					);
				}
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
					scheduledAt: scheduledAtStr,
					// Null for a normal creation; the original missed schedule's
					// id for a reschedule. The original row is never touched, so
					// it stays "missed" for audit — this pointer is the only link
					// between the two, and following it back yields the full
					// chain for a visit rescheduled more than once.
					rescheduledFromId,
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

			// Attach the printers immediately, instead of leaving a brand-new
			// schedule empty until the user happens to click Update again.
			// Deduplicated by printerId first — this is a fresh schedule, so
			// there's nothing existing to conflict with, but the submitted
			// list itself listing the same printer twice would still insert
			// two scheduleDetails rows for one printer on one schedule.
			// onConflictDoNothing is the real backstop (migration 0061's
			// unique index on scheduleId+printerId) — atomic, unlike a
			// select-then-insert check, which has a race window a fast
			// double-submit can still slip through.
			if (printersToAttach.length > 0) {
				const seen = new Set<number>();
				const uniqueToAttach = printersToAttach.filter((printer) => {
					if (seen.has(printer.printerId)) return false;
					seen.add(printer.printerId);
					return true;
				});
				await db
					.insert(scheduleDetails)
					.values(
						uniqueToAttach.map((printer) => ({
							scheduleId: newScheduleId!,
							printerId: printer.printerId,
							originMTId: printer.mtId,
						}))
					)
					.onConflictDoNothing({
						target: [scheduleDetails.scheduleId, scheduleDetails.printerId],
					});
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

				// The conflict check above deliberately excludes THIS schedule
				// (re-saving its own existing printers is normal, not a
				// conflict) — but that also means nothing stopped a printer
				// that's already on this schedule from being inserted a
				// SECOND time if the client's added/removed diff was ever
				// wrong (stale local state, a toggle-off-then-on, etc.), or
				// if this whole edit request was submitted twice in quick
				// succession. Production data confirmed exactly this: a
				// schedule where every one of its ~10 printers had been
				// duplicated, all at once — a double-submission, not a
				// per-printer mistake.
				//
				// Filtering here first avoids a confusing partial success on
				// the common case; onConflictDoNothing (migration 0061's
				// unique index) is the real, atomic backstop for the race a
				// select-then-filter check can still lose.
				const alreadyOnSchedule = await db
					.select({ printerId: scheduleDetails.printerId })
					.from(scheduleDetails)
					.where(
						and(
							eq(scheduleDetails.scheduleId, newScheduleId),
							inArray(
								scheduleDetails.printerId,
								printersToAdd.map((p) => p.printerId)
							)
						)
					);
				const alreadyOnScheduleIds = new Set(
					alreadyOnSchedule.map((r) => r.printerId)
				);
				const printersToInsert = printersToAdd.filter(
					(p) => !alreadyOnScheduleIds.has(p.printerId)
				);

				if (printersToInsert.length > 0) {
					await db
						.insert(scheduleDetails)
						.values(printersToInsert)
						.onConflictDoNothing({
							target: [scheduleDetails.scheduleId, scheduleDetails.printerId],
						});
				}
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

		// Always answer with an ARRAY. This branch used to return bare objects
		// ({ status: 200 } here, { message: "No schedules" } below) even though
		// the client types the response as Schedule[] and reads `.length` off
		// it — a non-array reply makes that length `undefined`, which silently
		// breaks every check built on it and can leave the Schedule form's
		// controls in the wrong state.
		if (technicianId === 0 || scheduledAt === null) {
			return NextResponse.json([], { status: 200 });
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
					// Visit order within the technician's day, set by drag-reordering
					// the itinerary cards on this page (null if never sequenced).
					// Selected here so the card grid can render in the same order
					// the technician actually sees on Time In.
					sequence: schedules.sequence,
					// Non-null when this schedule replaced a missed one. Drives
					// the "Rescheduled" marker in the grid, which is what makes
					// the audit trail visible rather than only stored.
					rescheduledFromId: schedules.rescheduledFromId,
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
				// Sequenced stops first (ascending), unsequenced after by id — the
				// SAME ordering rule used by every other itinerary read in this
				// project (attendance status, Time In's first-stop lookup, the
				// sequence PATCH route's own first-stop check), so this grid,
				// drag-reorder, and what the technician actually sees never
				// disagree about order.
				.orderBy(
					sql`CASE WHEN ${schedules.sequence} IS NULL THEN 1 ELSE 0 END`,
					asc(schedules.sequence),
					asc(schedules.id)
				);

			// An empty day is a normal, successful result — an empty array, not
			// a message object. See the note above.
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
					sequence: schedules.sequence,
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
				sequence: s.sequence,
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

			// Itinerary order: assigned sequence first (ascending), unsequenced
			// schedules after — sorted by id so their relative order is at least
			// stable across requests rather than depending on join order.
			fetchedSchedules.sort((a, b) => {
				if (a.sequence != null && b.sequence != null) return a.sequence - b.sequence;
				if (a.sequence != null) return -1;
				if (b.sequence != null) return 1;
				return a.id - b.id;
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
