// app/api/admin/master/sms-recipients/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { smsRecipients, users } from "@/db/schema";
import { asc, ilike, eq, or } from "drizzle-orm";
import { requireSuperAdmin } from "@/lib/require-role";

const bodySchema = z.object({
	userId: z.number().int().positive(),
	isActive: z.boolean().optional(),
});

export async function GET(req: Request) {
	const auth = await requireSuperAdmin();
	if (auth.error) return auth.error;

	const search = new URL(req.url).searchParams.get("search")?.trim();

	const rows = await db
		.select({
			id: smsRecipients.id,
			userId: smsRecipients.userId,
			firstName: users.firstName,
			lastName: users.lastName,
			email: users.email,
			role: users.role,
			contactNo: users.contactNo,
			isActive: smsRecipients.isActive,
		})
		.from(smsRecipients)
		.innerJoin(users, eq(users.id, smsRecipients.userId))
		.where(
			search
				? or(ilike(users.firstName, `%${search}%`), ilike(users.lastName, `%${search}%`))
				: undefined
		)
		.orderBy(asc(users.lastName), asc(users.firstName));

	return NextResponse.json(rows);
}

export async function POST(req: Request) {
	const auth = await requireSuperAdmin();
	if (auth.error) return auth.error;

	const parsed = bodySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "Invalid request", issues: parsed.error.flatten() },
			{ status: 400 }
		);
	}

	const [user] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.id, parsed.data.userId))
		.limit(1);
	if (!user) {
		return NextResponse.json({ error: "User not found." }, { status: 404 });
	}

	const [existing] = await db
		.select({ id: smsRecipients.id })
		.from(smsRecipients)
		.where(eq(smsRecipients.userId, parsed.data.userId))
		.limit(1);
	if (existing) {
		return NextResponse.json(
			{ error: "This user is already on the recipient list." },
			{ status: 409 }
		);
	}

	const [row] = await db
		.insert(smsRecipients)
		.values({
			userId: parsed.data.userId,
			isActive: parsed.data.isActive ?? true,
		})
		.returning();

	return NextResponse.json(row, { status: 201 });
}
