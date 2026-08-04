// app/api/admin/master/sms-recipients/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { smsRecipients } from "@/db/schema";
import { asc, ilike, eq } from "drizzle-orm";
import { requireRole } from "@/lib/require-role";

// PH mobile numbers: 09XXXXXXXXX or +639XXXXXXXXX — same pattern the OTP
// route already validates against, so a number that passes here is also one
// Semaphore will actually accept when Time In fires the notification.
const PH_MOBILE = /^(09\d{9}|\+639\d{9})$/;

const bodySchema = z.object({
	label: z.string().trim().min(1).max(100),
	mobileNumber: z.string().trim().regex(PH_MOBILE, "Invalid Philippine mobile number"),
	isActive: z.boolean().optional(),
});

export async function GET(req: Request) {
	const auth = await requireRole(["Admin"]);
	if (auth.error) return auth.error;

	const search = new URL(req.url).searchParams.get("search")?.trim();

	const rows = await db
		.select()
		.from(smsRecipients)
		.where(search ? ilike(smsRecipients.label, `%${search}%`) : undefined)
		.orderBy(asc(smsRecipients.label));

	return NextResponse.json(rows);
}

export async function POST(req: Request) {
	const auth = await requireRole(["Admin"]);
	if (auth.error) return auth.error;

	const parsed = bodySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "Invalid request", issues: parsed.error.flatten() },
			{ status: 400 }
		);
	}

	const [existing] = await db
		.select({ id: smsRecipients.id })
		.from(smsRecipients)
		.where(eq(smsRecipients.mobileNumber, parsed.data.mobileNumber))
		.limit(1);
	if (existing) {
		return NextResponse.json(
			{ error: "This mobile number is already on the recipient list." },
			{ status: 409 }
		);
	}

	const [row] = await db
		.insert(smsRecipients)
		.values({
			label: parsed.data.label,
			mobileNumber: parsed.data.mobileNumber,
			isActive: parsed.data.isActive ?? true,
		})
		.returning();

	return NextResponse.json(row, { status: 201 });
}
