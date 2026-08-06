// app/api/gps/locations/route.ts
//
// Every active Technician's latest known GPS state, one row each — powers
// both the Dashboard's Technician GPS Status panel and the technician
// picker on the GPS Monitoring page. A technician who has never sent a
// ping (never opened the app while on duty, or the feature is brand new)
// still appears, with gpsEnabled: false and null coordinates — "unknown"
// is itself useful information for an Admin watching the fleet, not a row
// to hide.
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, technicianGpsStatus } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireRole } from "@/lib/require-role";

export async function GET() {
	const auth = await requireRole(["Admin", "Scheduler"]);
	if (auth.error) return auth.error;

	try {
		const rows = await db
			.select({
				technicianId: users.id,
				name: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
				gpsEnabled: technicianGpsStatus.gpsEnabled,
				latitude: technicianGpsStatus.latitude,
				longitude: technicianGpsStatus.longitude,
				accuracy: technicianGpsStatus.accuracy,
				capturedAt: technicianGpsStatus.capturedAt,
				updatedAt: technicianGpsStatus.updatedAt,
			})
			.from(users)
			.leftJoin(
				technicianGpsStatus,
				eq(technicianGpsStatus.technicianId, users.id)
			)
			.where(and(eq(users.role, "Technician"), eq(users.isActive, true)))
			.orderBy(users.firstName, users.lastName);

		// leftJoin leaves gpsEnabled as SQL NULL for a technician with no row
		// yet — coalesce it to a real false rather than pushing that
		// three-state ambiguity onto every consumer of this endpoint.
		const data = rows.map((r) => ({
			...r,
			gpsEnabled: r.gpsEnabled ?? false,
		}));

		return NextResponse.json(data);
	} catch (err) {
		console.error("gps locations fetch failed:", err);
		const message = err instanceof Error ? err.message : String(err);
		if (/does not exist/i.test(message)) {
			return NextResponse.json(
				{
					error:
						"The database schema is out of date for GPS Monitoring. Run `npm run db:migrate` against this environment.",
				},
				{ status: 500 }
			);
		}
		return NextResponse.json(
			{ error: "Could not load technician GPS status." },
			{ status: 500 }
		);
	}
}
