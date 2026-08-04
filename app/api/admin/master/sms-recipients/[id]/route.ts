// app/api/admin/master/sms-recipients/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { smsRecipients } from "@/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { requireRole } from "@/lib/require-role";
import { normalizePhMobile } from "@/lib/sms";

const bodySchema = z.object({
	label: z.string().trim().min(1).max(100).optional(),
	mobileNumber: z.string().trim().optional(),
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

	let mobileNumber: string | undefined;
	if (parsed.data.mobileNumber) {
		mobileNumber = normalizePhMobile(parsed.data.mobileNumber) ?? undefined;
		if (!mobileNumber) {
			return NextResponse.json(
				{ error: "Invalid Philippine mobile number." },
				{ status: 400 }
			);
		}
		const [dupe] = await db
			.select({ id: smsRecipients.id })
			.from(smsRecipients)
			.where(and(eq(smsRecipients.mobileNumber, mobileNumber), ne(smsRecipients.id, id)))
			.limit(1);
		if (dupe) {
			return NextResponse.json(
				{ error: "This mobile number is already on the recipient list." },
				{ status: 409 }
			);
		}
	}

	const [row] = await db
		.update(smsRecipients)
		.set({ ...parsed.data, ...(mobileNumber ? { mobileNumber } : {}) })
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
