// app/api/schedule/assign/route.ts
// Creates a schedule for a single pending maintenance item in one call —
// used by the "Assign" flow on the Pending Maintenance panel. Requires
// technician, date, priority, and notes; client/location/printer come from
// the maintenance record being assigned.
import { NextResponse } from "next/server";
import { db } from "@/db";
import { schedules, scheduleDetails } from "@/db/schema";
import { z } from "zod";
import { requireRole } from "@/lib/require-role";

const bodySchema = z.object({
	maintainId: z.number().int().positive(),
	printerId: z.number().int().positive(),
	technicianId: z.number().int().positive(),
	clientId: z.number().int().positive(),
	locationId: z.number().int().positive(),
	priority: z.number().int().positive(),
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
			originMTId: maintainId,
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
