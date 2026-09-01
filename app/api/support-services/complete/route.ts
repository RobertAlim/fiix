// app/api/support-services/complete/route.ts
//
// The Support Services counterpart to POST /api/maintain — same
// idempotency contract (clientUuid, onConflictDoNothing + winner
// resolution for a concurrent replay), same "upload photo/signature to
// R2 first, then POST the resulting key" pattern, deliberately NOT
// reusing that route's code directly since the two tables and their
// required fields diverge enough (no printCount, no deploymentId, a
// two-value status instead of a statusId FK) that sharing an
// implementation would mean threading a lot of "if this is a support
// service" branches through maintain's already-complex handler.
import { NextResponse } from "next/server";
import { db } from "@/db";
import { supportServices } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
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
	// erroring or double-completing.
	const [existing] = await db
		.select({ id: supportServices.id })
		.from(supportServices)
		.where(eq(supportServices.clientUuid, data.clientUuid))
		.limit(1);
	if (existing) {
		return NextResponse.json({ id: existing.id, replayed: true });
	}

	const [activity] = await db
		.select({
			id: supportServices.id,
			technicianId: supportServices.technicianId,
			status: supportServices.status,
		})
		.from(supportServices)
		.where(eq(supportServices.id, data.supportServiceId))
		.limit(1);
	if (!activity) {
		return NextResponse.json({ error: "Support service not found." }, { status: 404 });
	}
	if (activity.technicianId !== authResult.user.id) {
		return NextResponse.json(
			{ error: "This activity is not assigned to you." },
			{ status: 403 }
		);
	}
	if (activity.status != null) {
		// Already completed (by an earlier, different sync — a retried
		// replay of the SAME sync was already handled by the clientUuid
		// check above). Not an error: the technician's device may have
		// queued this twice across two different offline sessions with
		// two different clientUuids before either one synced.
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
		.where(and(eq(supportServices.id, data.supportServiceId), isNull(supportServices.status)))
		.returning({ id: supportServices.id });

	// Lost the race above — re-fetch BY ID (not by clientUuid: the actual
	// winner may have used a different one entirely) and report what's
	// really there instead of assuming which request won.
	if (!updated) {
		const [current] = await db
			.select({ id: supportServices.id })
			.from(supportServices)
			.where(eq(supportServices.id, data.supportServiceId))
			.limit(1);
		if (current) return NextResponse.json({ id: current.id, alreadyCompleted: true });
		return NextResponse.json({ error: "Failed to complete activity." }, { status: 500 });
	}

	return NextResponse.json({ id: updated.id });
}
