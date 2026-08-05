// app/api/admin/master/sms-recipients/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { smsRecipients } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/require-role";

// userId is intentionally not editable here — swapping which person a
// recipient row represents is a delete-and-re-add, not an edit, so the
// role/opt-in validation in POST always runs for a new linkage.
const bodySchema = z.object({
	isActive: z.boolean().optional(),
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
			{ error: "Invalid request", issues: parsed.error.flatten() },
			{ status: 400 }
		);
	}

	const [row] = await db
		.update(smsRecipients)
		.set(parsed.data)
		.where(eq(smsRecipients.id, id))
		.returning();

	if (!row) {
		return NextResponse.json({ error: "Not found." }, { status: 404 });
	}
	return NextResponse.json(row);
}

export async function DELETE(
	_req: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	const auth = await requireRole(["Admin"]);
	if (auth.error) return auth.error;

	const id = parseId((await params).id);
	if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

	await db.delete(smsRecipients).where(eq(smsRecipients.id, id));
	return NextResponse.json({ success: true });
}
