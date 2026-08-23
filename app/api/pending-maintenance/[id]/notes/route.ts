// app/api/pending-maintenance/[id]/notes/route.ts
//
// Edits the free-text Notes on one maintenance report (maintain.notes) from
// the Pending Maintenance card's Notes popover
// (components/pages/PendingMaintenancePanel.tsx). Deliberately its own
// route rather than folded into the generic maintain PATCH surface: this is
// the ONE field on a submitted report that's safe to edit after the fact
// (a scheduler/office correction, e.g. fixing a typo or adding context) —
// everything else on `maintain` is what the technician actually did/found
// in the field and stays immutable here.
//
// Restricted to Super Admin ONLY — deliberately narrower than the regular
// "Admin" checks used elsewhere on this panel (Assign/Resolve). Role
// implication (lib/permissions.ts) only goes one direction, Super Admin ->
// Admin, so requireRole(["Super Admin"]) below does NOT also let a plain
// Admin through; this is the actual enforcement boundary; the frontend
// (PendingMaintenancePanel.tsx) only hides the popover from other roles for
// UX, it does not protect this endpoint.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { maintain } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/require-role";

const bodySchema = z.object({
	// Empty string is valid — it's how the popover clears existing notes.
	notes: z.string().max(2000, "Notes must be 2000 characters or fewer."),
});

function parseId(id: string) {
	const n = Number(id);
	return Number.isInteger(n) && n > 0 ? n : null;
}

export async function PATCH(
	req: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	const auth = await requireRole(["Super Admin"]);
	if (auth.error) return auth.error;

	const maintainId = parseId((await params).id);
	if (!maintainId) {
		return NextResponse.json({ error: "Invalid id." }, { status: 400 });
	}

	const parsed = bodySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json(
			{ error: parsed.error.issues[0]?.message ?? "Invalid request." },
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

	// Stored null (not "") when cleared, matching how the rest of the app
	// already treats an empty Notes field — see this row's `notes &&` guard
	// in PendingMaintenancePanel.tsx and the GET route's select.
	const trimmed = parsed.data.notes.trim();

	const [updated] = await db
		.update(maintain)
		.set({ notes: trimmed.length > 0 ? trimmed : null })
		.where(eq(maintain.id, maintainId))
		.returning({ id: maintain.id, notes: maintain.notes });

	return NextResponse.json(updated);
}
