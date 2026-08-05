// app/api/admin/purge-maintenance/route.ts
// Creates a historical maintenance record on behalf of a Technician. This is
// the write side of the temporary Purge Maintenance backfill tool — Admin
// only, no GPS fix (never was one to capture), and the record's date is
// whatever the Admin chose rather than "now". Deliberately a separate route
// from POST /api/maintain rather than a branch inside it: that route's
// contract (mandatory GPS, clientUuid idempotency, offline-sync replay
// handling) is load-bearing for the real field workflow and shouldn't grow
// a "skip all of that" escape hatch. The child-table insert logic below
// mirrors it closely by necessity, not by shared code, so that route's
// tested behavior can't be disturbed by changes made here.
import { db } from "@/db";
import {
	maintain,
	replace,
	repair,
	colors,
	resets,
	users,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { purgeMaintainSubmitSchema } from "@/validation/maintainSchema";
import { requireRole } from "@/lib/require-role";

export async function POST(req: Request) {
	const authResult = await requireRole(["Admin"]);
	if (authResult.error) return authResult.error;

	const parsed = purgeMaintainSubmitSchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "Invalid request", issues: parsed.error.flatten() },
			{ status: 400 }
		);
	}
	const data = parsed.data;

	// userId here is the *selected Technician*, not the signed-in Admin —
	// "Prepared By" on the backfilled record should read as the person who
	// actually did the work, matching every other maintenance record.
	const [technician] = await db
		.select({ id: users.id, role: users.role })
		.from(users)
		.where(eq(users.id, data.userId))
		.limit(1);
	if (!technician || technician.role !== "Technician") {
		return NextResponse.json(
			{ error: "Selected user is not a Technician." },
			{ status: 400 }
		);
	}

	try {
		// Backfilled record's date is the Admin's chosen date, stored at
		// noon UTC so no timezone ever rolls it onto the adjacent day —
		// same approach used for the itinerary-SMS date formatting.
		const backfilledCreatedAt = new Date(`${data.maintenanceDate}T12:00:00Z`);

		const [mt] = await db
			.insert(maintain)
			.values({
				deploymentId: data.deploymentId,
				clientId: data.client.value,
				locationId: data.location?.value,
				departmentId: data.department?.value,
				headClean: data.headClean,
				inkFlush: data.inkFlush,
				cleanPrinter: data.cleanPrinter,
				cleanWasteTank: data.cleanWasteTank,
				replaceUnit: data.replaceUnit,
				replaceSerialNo: data.replaceSerialNo,
				statusId: data.status,
				notes: data.notes,
				userId: data.userId,
				signatoryId: data.signatoryId,
				originMTId: data.originMTId,
				createdAt: backfilledCreatedAt,
				isBackfilled: true,
				// No clientUuid — this record never goes through offline-sync
				// idempotency/replay handling, so there's nothing to key it by.
			})
			.returning({ id: maintain.id });

		const mtId = mt.id;

		if (data.replace && data.replaceParts?.length) {
			await db.insert(replace).values(
				data.replaceParts.map((part) => ({
					mtId,
					partId: Number(part.partId),
				}))
			);
		}

		if (data.repair && data.repairParts?.length) {
			await db.insert(repair).values(
				data.repairParts.map((part) => ({
					mtId,
					partId: Number(part.partId),
				}))
			);
		}

		if (data.colorSelected) {
			await db.insert(colors).values({
				mtId,
				cyan: data.cyan,
				magenta: data.magenta,
				yellow: data.yellow,
				black: data.black,
			});
		}

		if (data.resetSelected) {
			await db.insert(resets).values({
				mtId,
				box: data.resetBox,
				program: data.resetProgram,
			});
		}

		// Deliberately no maintenanceLocation insert — that's the entire
		// mechanism by which the report print layout already omits "GPS
		// Verified Location" for these records (see components/print/
		// MaintainReport.tsx, which only renders that section when GPS data
		// is present).

		return NextResponse.json({ id: mtId }, { status: 201 });
	} catch (err) {
		console.error("Error creating backfilled maintenance record:", err);
		return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
	}
}
