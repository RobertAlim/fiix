// app/api/schedule/assign/route.ts
// Creates a schedule for a single pending maintenance item in one call —
// used by the "Assign" and "Reschedule" flows on the Pending Maintenance
// panel. Requires
// technician, date, priority, and notes; client/location/printer come from
// the maintenance record being assigned.
import { NextResponse } from "next/server";
import { db } from "@/db";
import { schedules, scheduleDetails, printers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "@/lib/require-role";

const bodySchema = z.object({
	// Optional: a missed ROUTINE schedule being rescheduled has no originating
	// maintenance record to point back at, unlike an issue-driven assignment.
	maintainId: z.number().int().positive().nullable().optional(),
	printerId: z.number().int().positive(),
	technicianId: z.number().int().positive(),
	clientId: z.number().int().positive(),
	locationId: z.number().int().positive(),
	priority: z.number().int().nonnegative(),
	notes: z.string().trim().max(2000).optional(),
	scheduleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "scheduleDate must be YYYY-MM-DD"),
});

export async function POST(req: Request) {
	const authResult = await requireRole(["Admin", "Scheduler"]);
	if (authResult.error) return authResult.error;

	const parsed = bodySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "Invalid request", issues: parsed.error.flatten() },
			{ status: 400 }
		);
	}

	const {
		maintainId,
		printerId,
		technicianId,
		clientId,
		locationId,
		priority,
		notes,
		scheduleDate,
	} = parsed.data;

	try {
		// A printer can only be in one place at a time — check before creating
		// anything, so a conflict never leaves behind an orphaned empty
		// schedule row.
		const [conflict] = await db
			.select({ serialNo: printers.serialNo })
			.from(scheduleDetails)
			.innerJoin(schedules, eq(schedules.id, scheduleDetails.scheduleId))
			.innerJoin(printers, eq(printers.id, scheduleDetails.printerId))
			.where(
				and(
					eq(schedules.scheduledAt, scheduleDate),
					eq(scheduleDetails.printerId, printerId)
				)
			)
			.limit(1);

		if (conflict) {
			return NextResponse.json(
				{
					error: `Printer ${conflict.serialNo} is already scheduled for ${scheduleDate}.`,
				},
				{ status: 409 }
			);
		}

		const [newSchedule] = await db
			.insert(schedules)
			.values({
				technicianId,
				clientId,
				locationId,
				priority,
				notes: notes || null,
				maintainAll: false,
				scheduledAt: scheduleDate,
			})
			.returning({ id: schedules.id });

		if (!newSchedule) {
			return NextResponse.json(
				{ error: "Failed to create schedule." },
				{ status: 500 }
			);
		}

		await db.insert(scheduleDetails).values({
			scheduleId: newSchedule.id,
			printerId,
			originMTId: maintainId ?? null,
			isMaintained: false,
		});

		return NextResponse.json(
			{ success: true, scheduleId: newSchedule.id },
			{ status: 201 }
		);
	} catch (error) {
		console.error("schedule/assign error:", error);
		return NextResponse.json(
			{ error: "Failed to create schedule." },
			{ status: 500 }
		);
	}
}
