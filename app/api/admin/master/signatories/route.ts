import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/require-role";
import { db } from "@/db";
import { signatories, clients } from "@/db/schema";
import { asc, eq, ilike, or } from "drizzle-orm";

const bodySchema = z.object({
	firstName: z.string().trim().min(1, "First name is required").max(20),
	lastName: z.string().trim().min(1, "Last name is required").max(20),
	clientId: z.number().int().positive().nullable().optional(),
});

export async function GET(req: Request) {
	const auth = await requireRole(["Admin"]);
	if (auth.error) return auth.error;

	const search = new URL(req.url).searchParams.get("search");

	const rows = await db
		.select({
			id: signatories.id,
			firstName: signatories.firstName,
			lastName: signatories.lastName,
			clientId: signatories.clientId,
			clientName: clients.name,
		})
		.from(signatories)
		.leftJoin(clients, eq(clients.id, signatories.clientId))
		.where(
			search
				? or(ilike(signatories.firstName, `%${search}%`), ilike(signatories.lastName, `%${search}%`))
				: undefined
		)
		.orderBy(asc(signatories.lastName), asc(signatories.firstName));

	return NextResponse.json(rows);
}

export async function POST(req: Request) {
	const auth = await requireRole(["Admin"]);
	if (auth.error) return auth.error;

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

	const [created] = await db
		.insert(signatories)
		.values({ firstName, lastName, clientId: clientId ?? null })
		.returning();
	return NextResponse.json(created, { status: 201 });
}
