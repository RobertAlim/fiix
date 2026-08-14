// app/api/gps/history/route.ts
//
// One technician's trail of real GPS fixes for one day — powers GPS
// Monitoring's "path traveled today" polyline. Reads technicianGpsPings
// (see db/schema.ts's doc comment on that table for why it's separate
// from technicianGpsStatus, the single-row live-position table
// GET /api/gps/locations reads instead).
import { NextResponse } from "next/server";
import { db } from "@/db";
import { technicianGpsPings } from "@/db/schema";
import { eq, and, gte, lt, asc, sql } from "drizzle-orm";
import { requireRole } from "@/lib/require-role";

export async function GET(req: Request) {
	const auth = await requireRole(["Admin", "Scheduler"]);
	if (auth.error) return auth.error;

	const url = new URL(req.url);
	const technicianIdParam = url.searchParams.get("technicianId");
	const technicianId = Number(technicianIdParam);
	if (!technicianIdParam || !Number.isInteger(technicianId) || technicianId <= 0) {
		return NextResponse.json({ error: "Invalid technicianId." }, { status: 400 });
	}

	// Optional ?date=YYYY-MM-DD (Admin looking back at a prior day);
	// defaults to today in the same Asia/Manila anchor every other
	// attendance/schedule query in this app uses, so "today" here always
	// means the same calendar day the technician's own Time In/Out did.
	const dateParam = url.searchParams.get("date");
	const dateExpr = dateParam
		? sql<string>`${dateParam}::date`
		: sql<string>`(now() AT TIME ZONE 'Asia/Manila')::date`;

	try {
		const rows = await db
			.select({
				latitude: technicianGpsPings.latitude,
				longitude: technicianGpsPings.longitude,
				accuracy: technicianGpsPings.accuracy,
				capturedAt: technicianGpsPings.capturedAt,
			})
			.from(technicianGpsPings)
			.where(
				and(
					eq(technicianGpsPings.technicianId, technicianId),
					// capturedAt is timestamptz; comparing against a Manila
					// calendar day means the day boundary itself is also
					// Manila-anchored, not UTC midnight — same reasoning as
					// the recently-fixed schedule-duplicate date bug (see
					// app/api/schedule/route.ts): mixing a UTC-formatted
					// bound with a Manila-intended day silently shifts
					// which pings count as "today" near the boundary.
					gte(
						technicianGpsPings.capturedAt,
						sql`(${dateExpr} AT TIME ZONE 'Asia/Manila')`
					),
					lt(
						technicianGpsPings.capturedAt,
						sql`((${dateExpr} + 1) AT TIME ZONE 'Asia/Manila')`
					)
				)
			)
			.orderBy(asc(technicianGpsPings.capturedAt));

		return NextResponse.json(rows);
	} catch (err) {
		console.error("gps history fetch failed:", err);
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
		return NextResponse.json({ error: "Could not load GPS history." }, { status: 500 });
	}
}
