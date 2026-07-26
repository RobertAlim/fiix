import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/require-role";
import { db } from "@/db";
import { signatories, clients, maintain } from "@/db/schema";
import { eq } from "drizzle-orm";
import { checkStillReferenced } from "@/lib/master-data/reference-check";

const bodySchema = z.object({
	firstName: z.string().trim().min(1, "First name is required").max(20),
	lastName: z.string().trim().min(1, "Last name is required").max(20),
	clientId: z.number().int().positive().nullable().optional(),
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
	const { firstName, lastName, clientId } = parsed.data;

	if (clientId) {
		const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId)).limit(1);
		if (!client) {
			return NextResponse.json({ error: "Selected client does not exist." }, { status: 400 });
		}
	}

	const [updated] = await db
		.update(signatories)
		.set({ firstName, lastName, clientId: clientId ?? null })
		.where(eq(signatories.id, id))
		.returning();
	if (!updated) return NextResponse.json({ error: "Signatory not found." }, { status: 404 });
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
		{ label: "maintenance records", column: maintain.signatoryId },
	]);
	if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });

	await db.delete(signatories).where(eq(signatories.id, id));
	return NextResponse.json({ success: true });
}
