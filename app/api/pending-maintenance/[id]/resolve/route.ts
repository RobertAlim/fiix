// app/api/pending-maintenance/[id]/resolve/route.ts
//
// Marks one Pending Maintenance item resolved and records who did it, when,
// and why — see db/schema.ts's doc comment on maintenanceResolutions for
// why this is a separate append-only table rather than columns bolted onto
// `maintain` (the technician's field report stays exactly as filed).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { maintain, maintenanceResolutions } from "@/db/schema";
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
		.select({ id: maintain.id })
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
		// Race on the unique maintainId constraint — same friendly message
		// as the pre-check above, not a raw 500.
		return NextResponse.json(
			{ error: "This item has already been resolved." },
			{ status: 409 }
		);
	}

	return NextResponse.json(row, { status: 201 });
}
