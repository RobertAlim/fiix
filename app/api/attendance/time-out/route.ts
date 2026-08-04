// app/api/attendance/time-out/route.ts
import { db } from "@/db";
import { technicianAttendance } from "@/db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/require-role";

export async function POST() {
	const auth = await requireRole(["Technician"]);
	if (auth.error) return auth.error;
	const technicianId = auth.user.id;

	const phToday = sql<string>`(now() AT TIME ZONE 'Asia/Manila')::date`;

	const [session] = await db
		.update(technicianAttendance)
		.set({ timeOut: new Date() })
		.where(
			and(
				eq(technicianAttendance.technicianId, technicianId),
				eq(technicianAttendance.workDate, phToday),
				// Only close an open session — a second Time Out tap becomes a
				// harmless no-op that reports the same error either way,
				// rather than silently overwriting the original timestamp.
				isNull(technicianAttendance.timeOut)
			)
		)
		.returning();

	if (!session) {
		return NextResponse.json(
			{ error: "No open session to time out of. Time in first." },
			{ status: 409 }
		);
	}

	return NextResponse.json({ session });
}
