// app/api/schedule/exists/route.ts
// Answers "is there already a schedule for this company + location +
// technician + date?" so the frontend can dynamically switch between Save
// and Update instead of requiring the user to manually navigate into an
// "editing" state.
//
// technicianId is a required part of the match (not just clientId +
// locationId + scheduledAt): a client can now legitimately have more than
// one technician assigned on the same date, each with their own separate
// itinerary. Matching on client+location+date alone used to silently
// hijack the form into editing WHICHEVER technician's schedule happened to
// exist first for that client/location/date, even when the Scheduler had
// picked a different technician — which is exactly the restriction this
// update removes.
import { NextResponse } from "next/server";
import { db } from "@/db";
import { schedules } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireRole } from "@/lib/require-role";

export async function GET(req: Request) {
	const authResult = await requireRole(["Admin", "Scheduler"]);
	if (authResult.error) return authResult.error;

	const { searchParams } = new URL(req.url);
	const clientId = Number(searchParams.get("clientId"));
	const locationId = Number(searchParams.get("locationId"));
	const technicianId = Number(searchParams.get("technicianId"));
	const scheduledAt = searchParams.get("scheduledAt");

	if (!clientId || !locationId || !technicianId || !scheduledAt) {
		return NextResponse.json({ exists: false });
	}

	const [existing] = await db
		.select({
			id: schedules.id,
			technicianId: schedules.technicianId,
			priority: schedules.priority,
			notes: schedules.notes,
			maintainAll: schedules.maintainAll,
		})
		.from(schedules)
		.where(
			and(
				eq(schedules.clientId, clientId),
				eq(schedules.locationId, locationId),
				eq(schedules.technicianId, technicianId),
				eq(schedules.scheduledAt, scheduledAt)
			)
		)
		.limit(1);

	if (!existing) {
		return NextResponse.json({ exists: false });
	}

	return NextResponse.json({ exists: true, schedule: existing });
}
