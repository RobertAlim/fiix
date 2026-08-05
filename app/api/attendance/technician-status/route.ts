// app/api/attendance/technician-status/route.ts
// Tells the Scheduler whether a given technician has already timed in
// today, so the UI can lock reordering the first itinerary stop (see
// PATCH /api/schedule/sequence, which enforces the same rule server-side —
// this route only drives the client-side warning/lock, it isn't itself the
// authority).
import { db } from "@/db";
import { technicianAttendance } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/require-role";

export async function GET(req: Request) {
	const auth = await requireRole(["Admin", "Scheduler"]);
	if (auth.error) return auth.error;

	const technicianIdParam = new URL(req.url).searchParams.get("technicianId");
	const technicianId = Number(technicianIdParam);
	if (!technicianIdParam || !Number.isInteger(technicianId) || technicianId <= 0) {
		return NextResponse.json({ error: "Invalid technicianId." }, { status: 400 });
	}

	const phToday = sql<string>`(now() AT TIME ZONE 'Asia/Manila')::date`;

	const [session] = await db
		.select({ id: technicianAttendance.id })
		.from(technicianAttendance)
		.where(
			and(
				eq(technicianAttendance.technicianId, technicianId),
				eq(technicianAttendance.workDate, phToday)
			)
		)
		.limit(1);

	return NextResponse.json({ timedInToday: !!session });
}
