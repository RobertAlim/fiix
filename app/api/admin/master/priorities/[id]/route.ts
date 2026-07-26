import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/require-role";
import { db } from "@/db";
import { priorities, schedules } from "@/db/schema";
import { eq, ilike, ne, and } from "drizzle-orm";
import { checkStillReferenced } from "@/lib/master-data/reference-check";

// Note: id is the primary key for priorities (manually assigned, not
// auto-incrementing) and is referenced by schedules.priority, so it's
// intentionally not editable here — only the display name can change.
const bodySchema = z.object({
	name: z.string().trim().min(1, "Name is required").max(6),
});

function parseId(id: string) {
	const n = Number(id);
	return Number.isInteger(n) && n > 0 ? n : null;
}

export async function PATCH(
	req: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	const auth = await requireRole(["Admin"]);
	if (auth.error) return auth.error;

	const id = parseId((await params).id);
	if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

	const parsed = bodySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json(
			{ error: parsed.error.issues[0]?.message ?? "Invalid input." },
			{ status: 400 }
		);
	}
	const { name } = parsed.data;

	const [dup] = await db
		.select({ id: priorities.id })
		.from(priorities)
		.where(and(ilike(priorities.name, name), ne(priorities.id, id)))
		.limit(1);
	if (dup) {
		return NextResponse.json({ error: `A priority named "${name}" already exists.` }, { status: 400 });
	}

	const [updated] = await db.update(priorities).set({ name }).where(eq(priorities.id, id)).returning();
	if (!updated) return NextResponse.json({ error: "Priority not found." }, { status: 404 });
	return NextResponse.json(updated);
}

export async function DELETE(
	_req: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	const auth = await requireRole(["Admin"]);
	if (auth.error) return auth.error;

	const id = parseId((await params).id);
	if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

	const blocked = await checkStillReferenced(id, [
		{ label: "schedules", column: schedules.priority },
	]);
	if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });

	await db.delete(priorities).where(eq(priorities.id, id));
	return NextResponse.json({ success: true });
}
