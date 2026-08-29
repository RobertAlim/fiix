// app/api/attendance/report/people/route.ts
//
// Backs the Attendance Report's person picker. Deliberately NOT the same
// source as /api/technicians (which only ever returns role="Technician",
// for the Schedule-assignment picker elsewhere) — this returns everyone
// who has AT LEAST ONE technicianAttendance row, regardless of role, so an
// Admin or Scheduler who has used Timekeep shows up here too, without
// cluttering the list with every Admin account that's never actually
// timed in.
import { NextResponse } from "next/server";
import { db } from "@/db";
import { technicianAttendance, users } from "@/db/schema";
import { eq, asc, sql } from "drizzle-orm";
import { requireRole } from "@/lib/require-role";

export async function GET() {
	const auth = await requireRole(["Admin", "Super Admin"]);
	if (auth.error) return auth.error;

	const people = await db
		.selectDistinctOn([technicianAttendance.technicianId], {
			id: technicianAttendance.technicianId,
			name: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
			role: users.role,
		})
		.from(technicianAttendance)
		.innerJoin(users, eq(users.id, technicianAttendance.technicianId))
		.orderBy(asc(technicianAttendance.technicianId));

	// selectDistinctOn doesn't take a secondary ORDER BY across the whole
	// result set (only within each distinct group), so the friendlier
	// alphabetical order for a dropdown is applied here instead.
	people.sort((a, b) => a.name.localeCompare(b.name));

	return NextResponse.json(people);
}
