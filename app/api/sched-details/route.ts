// app/api/sched-details/route.ts
//
// Marks one scheduleDetails row as maintained and links it to the report
// that was just filed. Called by features/offline-sync/sync-engine.ts as
// the last step of syncing a report — the sync engine only moves on if
// this responds with a real success, and retries on a real failure.
//
// This used to be unable to do either: the catch block returned
// `{ success: true }` BEFORE its own error-logging and 500 response,
// making that response unreachable dead code — so any exception during
// the update was silently swallowed and reported as success. Separately,
// a stale or mismatched `schedDetailsId` (matching zero rows) also wasn't
// treated as a failure — the UPDATE just silently affected nothing, and
// the route still returned success. Both meant the sync engine could
// believe a report was fully linked to its schedule when the
// scheduleDetails row was never actually touched — exactly the "report
// exists, but Schedule Details still shows Pending" symptom this was
// written to fix.
import { db } from "@/db";
import { scheduleDetails } from "@/db/schema";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "@/lib/require-role";

const bodySchema = z.object({
	schedDetailsId: z.number().int().positive(),
	mtId: z.number().int().positive(),
});

export async function POST(req: Request) {
	const authResult = await requireRole(["Admin", "Technician"]);
	if (authResult.error) return authResult.error;

	const parsed = bodySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "Invalid request", issues: parsed.error.flatten() },
			{ status: 400 }
		);
	}
	const { schedDetailsId, mtId } = parsed.data;

	try {
		const [updated] = await db
			.update(scheduleDetails)
			.set({
				originMTId: mtId,
				isMaintained: true,
				maintainedDate: new Date(),
			})
			.where(eq(scheduleDetails.id, schedDetailsId))
			.returning({ id: scheduleDetails.id });

		// The UPDATE affecting zero rows is NOT an exception in Postgres —
		// it succeeds silently. Checking the returned row is the only way
		// to tell "this schedDetailsId doesn't exist (anymore)" apart from
		// "it worked", and the sync engine needs to know the difference so
		// it can surface this rather than believe a report was linked when
		// it wasn't.
		if (!updated) {
			return NextResponse.json(
				{ error: `scheduleDetails ${schedDetailsId} not found.` },
				{ status: 404 }
			);
		}

		return NextResponse.json({ success: true });
	} catch (err) {
		console.error("❌ Error updating scheduleDetails:", err);
		return NextResponse.json(
			{ error: "Failed to update scheduleDetails." },
			{ status: 500 }
		);
	}
}
