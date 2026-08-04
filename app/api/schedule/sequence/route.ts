// app/api/schedule/sequence/route.ts
// Lets the Scheduler set the visit order for one technician's day. Takes the
// full ordered list of schedule ids for that (technician, date) rather than
// a single move, so drag-and-drop reordering on the client can just POST its
// current array — no separate "swap these two" protocol to keep in sync.
import { NextResponse } from "next/server";
import { db } from "@/db";
import { schedules } from "@/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "@/lib/require-role";

const bodySchema = z.object({
	technicianId: z.number().int().positive(),
	scheduledAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "scheduledAt must be YYYY-MM-DD"),
	// Ordered top-to-bottom; position in the array becomes the sequence number.
	orderedScheduleIds: z.array(z.number().int().positive()).min(1),
});

export async function PATCH(req: Request) {
	const authResult = await requireRole(["Admin", "Scheduler"]);
	if (authResult.error) return authResult.error;

	const parsed = bodySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "Invalid request", issues: parsed.error.flatten() },
			{ status: 400 }
		);
	}
	const { technicianId, scheduledAt, orderedScheduleIds } = parsed.data;

	// Every id in the reorder must actually belong to this technician's day —
	// otherwise a stale client array could silently move someone else's
	// schedule (or a schedule from a different date) into this sequence.
	const owned = await db
		.select({ id: schedules.id })
		.from(schedules)
		.where(
			and(
				eq(schedules.technicianId, technicianId),
				eq(schedules.scheduledAt, scheduledAt),
				inArray(schedules.id, orderedScheduleIds)
			)
		);

	if (owned.length !== orderedScheduleIds.length) {
		return NextResponse.json(
			{
				error:
					"One or more schedules do not belong to this technician's day. Refresh and try again.",
			},
			{ status: 409 }
		);
	}

	// A single CASE-based UPDATE keeps the reorder atomic — no window where
	// a concurrent read could see a partially-renumbered day.
	const caseExpr = sql.join(
		[
			sql`CASE "id"`,
			...orderedScheduleIds.map((id, i) => sql`WHEN ${id} THEN ${i + 1}`),
			sql`END`,
		],
		sql` `
	);

	await db
		.update(schedules)
		.set({ sequence: caseExpr })
		.where(inArray(schedules.id, orderedScheduleIds));

	return NextResponse.json({ success: true });
}
