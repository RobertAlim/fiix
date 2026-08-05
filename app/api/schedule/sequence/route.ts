// app/api/schedule/sequence/route.ts
// Lets the Scheduler set the visit order for one technician's day. Takes the
// full ordered list of schedule ids for that (technician, date) rather than
// a single move, so drag-and-drop reordering on the client can just POST its
// current array — no separate "swap these two" protocol to keep in sync.
//
// Two business rules layered on top of the plain reorder:
//  1. If the technician has already timed in TODAY, the first stop is
//     locked — they may already be en route to it or on site, so silently
//     bumping them to a different first stop is the kind of change that
//     needs a phone call, not a background reorder. Only applies when
//     scheduledAt is today; future/past days are unaffected.
//  2. On every successful save, the assigned technician gets an SMS —
//     "your itinerary has been set" for a future date, "has been updated"
//     for today. This runs unconditionally, including when nothing in the
//     order actually changed, by design: with the Scheduler UI's Save
//     button always enabled (no more "nothing changed" gate), a deliberate
//     re-click is the intended way to re-notify a technician.
import { NextResponse } from "next/server";
import { db } from "@/db";
import { schedules, users, technicianAttendance } from "@/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "@/lib/require-role";
import {
	phTodayDateString,
	formatScheduleDayLabel,
} from "@/lib/attendance";
import { sendSmsToRecipients } from "@/lib/sms";

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
	// Also doubles as the "current order" read used by the first-stop lock
	// below, so it's fetched with `sequence` rather than just `id`.
	const owned = await db
		.select({ id: schedules.id, sequence: schedules.sequence })
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

	const isToday = scheduledAt === phTodayDateString();

	if (isToday) {
		const [session] = await db
			.select({ id: technicianAttendance.id })
			.from(technicianAttendance)
			.where(
				and(
					eq(technicianAttendance.technicianId, technicianId),
					eq(technicianAttendance.workDate, scheduledAt)
				)
			)
			.limit(1);

		if (session) {
			// Same ordering rule used everywhere else the itinerary is
			// displayed (schedule GET, attendance status): sequenced stops
			// first ascending, unsequenced after by id.
			const currentFirst = [...owned].sort((a, b) => {
				if (a.sequence != null && b.sequence != null) return a.sequence - b.sequence;
				if (a.sequence != null) return -1;
				if (b.sequence != null) return 1;
				return a.id - b.id;
			})[0];

			if (currentFirst && orderedScheduleIds[0] !== currentFirst.id) {
				return NextResponse.json(
					{
						error:
							"The technician has already timed in. Re-ordering the first itinerary is not allowed.",
					},
					{ status: 409 }
				);
			}
		}
	}

	// A single CASE-based UPDATE keeps the reorder atomic — no window where
	// a concurrent read could see a partially-renumbered day.
	//
	// The explicit ::integer cast on each THEN branch is required, not
	// decorative: with nothing but parameter placeholders inside the CASE,
	// Postgres has no literal to infer a type from and defaults them to
	// text — which then fails to assign into the integer `sequence` column
	// ("column is of type integer but expression is of type text").
	// Verified against a real Postgres engine (pglite) to catch this before
	// it reached the route, since it's the kind of runtime-only SQL error
	// that neither tsc nor drizzle's own type checking catches — drizzle's
	// `sql` template is just building a string; nothing statically verifies
	// the query is well-typed against the actual database.
	const caseExpr = sql.join(
		[
			sql`CASE "id"`,
			...orderedScheduleIds.map((id, i) => sql`WHEN ${id} THEN ${i + 1}::integer`),
			sql`END`,
		],
		sql` `
	);

	await db
		.update(schedules)
		.set({ sequence: caseExpr })
		.where(inArray(schedules.id, orderedScheduleIds));

	// Best-effort notification — a delivery failure must never fail the
	// reorder itself, which already succeeded above. Skipped entirely for a
	// past date: reordering history (allowed — the date picker has no lower
	// bound, for correcting old records) shouldn't tell a technician their
	// itinerary "has been set" for a day that's already over.
	const isPast = scheduledAt < phTodayDateString();
	if (!isPast) {
		try {
			const [technician] = await db
				.select({ firstName: users.firstName, contactNo: users.contactNo })
				.from(users)
				.where(eq(users.id, technicianId))
				.limit(1);

			if (technician?.contactNo) {
				const message = isToday
					? `Hello ${technician.firstName}! Your itinerary has been updated. For more details, please visit your dashboard: https://www.fruitbeanink.com/fiix/dashboard`
					: `Hello ${technician.firstName}! Your itinerary for ${formatScheduleDayLabel(
							scheduledAt
					  )} has been set. For more details, please visit your dashboard: https://www.fruitbeanink.com/fiix/dashboard`;

				await sendSmsToRecipients([technician.contactNo], message);
			}
		} catch (err) {
			console.error("Itinerary SMS notification failed:", err);
		}
	}

	return NextResponse.json({ success: true });
}
