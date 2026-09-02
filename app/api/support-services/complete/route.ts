// app/api/support-services/complete/route.ts
//
// The Support Services counterpart to POST /api/maintain — same
// idempotency contract (clientUuid, onConflictDoNothing + winner
// resolution for a concurrent replay), same "upload photo/signature to
// R2 first, then POST the resulting key" pattern.
//
// Handles TWO cases, branching on which id the client sent (exactly one,
// enforced by the Zod schema):
//   - supportServiceId: completing a Scheduler-created Support Service
//     row that already exists.
//   - scheduleId: documenting a printer-less `schedules` row for the
//     FIRST time — the original request's "a Schedule was set for a
//     client but no printer itinerary selected" case. No supportServices
//     row exists yet; this creates one and links it back via
//     scheduleId, rather than updating a row that was never created.
import { NextResponse } from "next/server";
import { db } from "@/db";
import { supportServices, schedules, scheduleDetails } from "@/db/schema";
import { eq, and, isNull, count } from "drizzle-orm";
import { requireRole } from "@/lib/require-role";
import { supportServiceCompleteSchema } from "@/validation/supportServiceSchema";

export async function POST(req: Request) {
	const authResult = await requireRole(["Technician"]);
	if (authResult.error) return authResult.error;

	const body = await req.json();
	const parsed = supportServiceCompleteSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json(parsed.error.format(), { status: 400 });
	}
	const data = parsed.data;

	// The caller's OWN id, not whatever the client claims — a technicianId
	// mismatch here would let one technician complete another's assigned
	// activity, which requireRole alone doesn't prevent (it only verifies
	// SOME technician is signed in, not that they own this specific row).
	if (data.technicianId !== authResult.user.id) {
		return NextResponse.json(
			{ error: "This activity is not assigned to you." },
			{ status: 403 }
		);
	}

	// "Achieved" requires both a photo and a signature — same
	// server-side-re-validates-what-the-client-already-checked posture as
	// maintain's printCount requirement, since the client-side check alone
	// is never the actual boundary.
	if (data.status === "Achieved" && (!data.photoPath || !data.signPath)) {
		return NextResponse.json(
			{ error: "A photo and signature are required for an Achieved activity." },
			{ status: 400 }
		);
	}

	// IDEMPOTENCY — a retried sync of the same locally-saved completion
	// replays the same clientUuid. Return the existing record rather than
	// erroring or double-completing. Shared by BOTH branches below, since
	// a clientUuid replay means "this exact submission was already
	// processed" regardless of which case it originated from.
	const [existingByUuid] = await db
		.select({ id: supportServices.id })
		.from(supportServices)
		.where(eq(supportServices.clientUuid, data.clientUuid))
		.limit(1);
	if (existingByUuid) {
		return NextResponse.json({ id: existingByUuid.id, replayed: true });
	}

	if (data.supportServiceId != null) {
		return completeExisting(data, data.supportServiceId, authResult.user.id);
	}
	// Zod's refine() guarantees scheduleId is set when supportServiceId
	// isn't — the `!` here reflects that, not an unchecked assumption.
	return createFromSchedule(data, data.scheduleId!, authResult.user.id);
}

async function completeExisting(
	data: Awaited<ReturnType<typeof supportServiceCompleteSchema["parseAsync"]>>,
	supportServiceId: number,
	callerId: number
) {
	const [activity] = await db
		.select({
			id: supportServices.id,
			technicianId: supportServices.technicianId,
			status: supportServices.status,
		})
		.from(supportServices)
		.where(eq(supportServices.id, supportServiceId))
		.limit(1);
	if (!activity) {
		return NextResponse.json({ error: "Support service not found." }, { status: 404 });
	}
	if (activity.technicianId !== callerId) {
		return NextResponse.json(
			{ error: "This activity is not assigned to you." },
			{ status: 403 }
		);
	}
	if (activity.status != null) {
		// Already completed (by an earlier, different sync — a retried
		// replay of the SAME sync was already handled by the clientUuid
		// check in the caller). Not an error: the technician's device may
		// have queued this twice across two different offline sessions
		// with two different clientUuids before either one synced.
		return NextResponse.json({ id: activity.id, alreadyCompleted: true });
	}

	const [updated] = await db
		.update(supportServices)
		.set({
			status: data.status,
			technicianNotes: data.notes,
			signatoryId: data.signatoryId,
			photoUrl: data.photoPath ?? null,
			signatureUrl: data.signPath ?? null,
			gpsLatitude: data.gps.latitude,
			gpsLongitude: data.gps.longitude,
			gpsAccuracy: data.gps.accuracy,
			gpsCapturedAt: new Date(data.gps.capturedAt),
			clientUuid: data.clientUuid,
			completedAt: new Date(),
			updatedAt: new Date(),
		})
		// `isNull(status)` makes this atomic against a concurrent completion
		// racing the same row (two sync attempts, possibly with different
		// clientUuids, between the read above and this write) — only the
		// first UPDATE to actually reach Postgres can match this WHERE
		// clause; a loser gets zero rows back rather than silently
		// clobbering the winner's data.
		.where(and(eq(supportServices.id, supportServiceId), isNull(supportServices.status)))
		.returning({ id: supportServices.id });

	// Lost the race above — re-fetch BY ID (not by clientUuid: the actual
	// winner may have used a different one entirely) and report what's
	// really there instead of assuming which request won.
	if (!updated) {
		const [current] = await db
			.select({ id: supportServices.id })
			.from(supportServices)
			.where(eq(supportServices.id, supportServiceId))
			.limit(1);
		if (current) return NextResponse.json({ id: current.id, alreadyCompleted: true });
		return NextResponse.json({ error: "Failed to complete activity." }, { status: 500 });
	}

	return NextResponse.json({ id: updated.id });
}

async function createFromSchedule(
	data: Awaited<ReturnType<typeof supportServiceCompleteSchema["parseAsync"]>>,
	scheduleId: number,
	callerId: number
) {
	// clientId/locationId/scheduledAt are re-derived from the schedule
	// itself rather than trusted from the request body — the technician's
	// device already has them right (they came from the same schedule
	// row), but a completion route creating a NEW record is exactly the
	// place to not trust client-supplied identity fields when the source
	// of truth is one query away.
	const [schedule] = await db
		.select({
			id: schedules.id,
			technicianId: schedules.technicianId,
			clientId: schedules.clientId,
			locationId: schedules.locationId,
			scheduledAt: schedules.scheduledAt,
			sequence: schedules.sequence,
		})
		.from(schedules)
		.where(eq(schedules.id, scheduleId))
		.limit(1);
	if (!schedule) {
		return NextResponse.json({ error: "Schedule not found." }, { status: 404 });
	}
	if (schedule.technicianId !== callerId) {
		return NextResponse.json(
			{ error: "This schedule is not assigned to you." },
			{ status: 403 }
		);
	}

	// Server-side re-check of the actual business rule ("no printer
	// itinerary selected") — the mobile app only offers this action for
	// schedules it already knows have zero scheduleDetails, but that's a
	// client-side read, not a guarantee; re-verified here rather than
	// trusted.
	const [{ printerCount }] = await db
		.select({ printerCount: count() })
		.from(scheduleDetails)
		.where(eq(scheduleDetails.scheduleId, scheduleId));
	if (printerCount > 0) {
		return NextResponse.json(
			{ error: "This schedule has printers attached — document it through Maintenance instead." },
			{ status: 400 }
		);
	}

	// A printer-less schedule can only be documented once — same
	// "already completed" guard as the existing-row path, just checked
	// by scheduleId instead of by id since there's no row yet on the
	// first successful attempt.
	const [alreadyDocumented] = await db
		.select({ id: supportServices.id })
		.from(supportServices)
		.where(eq(supportServices.scheduleId, scheduleId))
		.limit(1);
	if (alreadyDocumented) {
		return NextResponse.json({ id: alreadyDocumented.id, alreadyCompleted: true });
	}

	const [inserted] = await db
		.insert(supportServices)
		.values({
			clientId: schedule.clientId,
			locationId: schedule.locationId,
			supportServiceTypeId: data.supportServiceTypeId,
			technicianId: callerId,
			scheduledAt: schedule.scheduledAt,
			scheduleId: schedule.id,
			// Inherits the originating schedule's sequence — this row is
			// excluded from GET /api/support-services' own list (see that
			// route's isNull(scheduleId) filter), so this value is really
			// only for internal consistency (e.g. if something ever queries
			// supportServices directly for reporting), not for the mobile
			// itinerary ordering, which reads sequence off the SCHEDULE
			// itself for this card.
			sequence: schedule.sequence,
			status: data.status,
			technicianNotes: data.notes,
			signatoryId: data.signatoryId,
			photoUrl: data.photoPath ?? null,
			signatureUrl: data.signPath ?? null,
			gpsLatitude: data.gps.latitude,
			gpsLongitude: data.gps.longitude,
			gpsAccuracy: data.gps.accuracy,
			gpsCapturedAt: new Date(data.gps.capturedAt),
			clientUuid: data.clientUuid,
			completedAt: new Date(),
		})
		.returning({ id: supportServices.id })
		.onConflictDoNothing({ target: supportServices.clientUuid });

	// A concurrent replay (window + retry racing) can make the insert
	// no-op on the unique clientUuid index — same pattern as
	// POST /api/maintain — resolve to the winner rather than erroring.
	if (!inserted) {
		const [winner] = await db
			.select({ id: supportServices.id })
			.from(supportServices)
			.where(eq(supportServices.clientUuid, data.clientUuid))
			.limit(1);
		if (winner) return NextResponse.json({ id: winner.id, replayed: true });
		return NextResponse.json({ error: "Failed to save activity." }, { status: 500 });
	}

	return NextResponse.json({ id: inserted.id });
}
