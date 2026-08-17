// app/api/pending-maintenance/[id]/resolve/route.ts
//
// Marks one Pending Maintenance item resolved. Does two things, in this
// order:
//   1. Updates maintain.statusId to the "Resolved" status (seeded by
//      migration 0060). This is the change that actually makes the item
//      disappear from GET /api/pending-maintenance — that route's WHERE
//      clause only ever returns rows whose latest status is one of
//      NEEDS_ATTENTION_STATUSES (lib/maintenance-status.ts), and
//      "Resolved" was deliberately never added to that list.
//   2. Records the audit trail — who, when, why — in maintenanceResolutions.
//      See that table's doc comment in db/schema.ts for why this is a
//      separate append-only table rather than columns bolted onto
//      `maintain` itself: this route changes the report's WORKFLOW status
//      (open -> resolved), the same kind of transition a support ticket
//      makes when closed, which is different from rewriting what the
//      technician actually found or did in the field.
//
// Order matters here given neon-http has no real transactions: if the
// audit insert were to fail after the status flip, the item would still
// correctly disappear from the active list (the actual requirement), just
// without a recorded reason — recoverable and visible, vs. the reverse
// order where a successful audit row could be left pointing at an item
// that never actually left the active list.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { maintain, maintenanceResolutions, status } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/require-role";

const bodySchema = z.object({
	notes: z.string().trim().min(1, "Resolution notes are required."),
});

function parseId(id: string) {
	const n = Number(id);
	return Number.isInteger(n) && n > 0 ? n : null;
}

export async function POST(
	req: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	// Role implication (lib/permissions.ts) means Super Admin passes this
	// too — "Admin" here is the operational role check, not a literal
	// string match.
	const auth = await requireRole(["Admin"]);
	if (auth.error) return auth.error;

	const maintainId = parseId((await params).id);
	if (!maintainId) {
		return NextResponse.json({ error: "Invalid id." }, { status: 400 });
	}

	const parsed = bodySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json(
			{ error: parsed.error.flatten().fieldErrors.notes?.[0] ?? "Invalid request." },
			{ status: 400 }
		);
	}

	const [record] = await db
		.select({ id: maintain.id, statusId: maintain.statusId })
		.from(maintain)
		.where(eq(maintain.id, maintainId))
		.limit(1);
	if (!record) {
		return NextResponse.json(
			{ error: "Maintenance record not found." },
			{ status: 404 }
		);
	}

	const [existing] = await db
		.select({ id: maintenanceResolutions.id })
		.from(maintenanceResolutions)
		.where(eq(maintenanceResolutions.maintainId, maintainId))
		.limit(1);
	if (existing) {
		return NextResponse.json(
			{ error: "This item has already been resolved." },
			{ status: 409 }
		);
	}

	// Seeded by migration 0060 — if it's somehow missing (migration not
	// yet run against this environment), fail with a clear, actionable
	// message rather than a raw FK-violation 500.
	const [resolvedStatus] = await db
		.select({ id: status.id })
		.from(status)
		.where(eq(status.name, "Resolved"))
		.limit(1);
	if (!resolvedStatus) {
		return NextResponse.json(
			{
				error:
					"The \"Resolved\" status is not set up in this environment yet. Run `npm run db:migrate` and try again.",
			},
			{ status: 500 }
		);
	}

	if (record.statusId === resolvedStatus.id) {
		return NextResponse.json(
			{ error: "This item has already been resolved." },
			{ status: 409 }
		);
	}

	await db
		.update(maintain)
		.set({ statusId: resolvedStatus.id })
		.where(eq(maintain.id, maintainId));

	let row;
	try {
		[row] = await db
			.insert(maintenanceResolutions)
			.values({
				maintainId,
				resolvedByUserId: auth.user.id,
				notes: parsed.data.notes,
			})
			.returning();
	} catch {
		// Race on the unique maintainId constraint — the status flip above
		// already succeeded and stands; only the audit insert lost the
		// race, so this is a friendly message, not a rollback (there is
		// nothing to roll back to — see the ordering note at the top).
		return NextResponse.json(
			{ error: "This item has already been resolved." },
			{ status: 409 }
		);
	}

	return NextResponse.json(row, { status: 201 });
}
