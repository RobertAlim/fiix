import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/require-role";
import { db } from "@/db";
import { priorities } from "@/db/schema";
import { asc, eq, ilike } from "drizzle-orm";

const bodySchema = z.object({
	id: z.number().int().positive(),
	name: z.string().trim().min(1, "Name is required").max(6),
});

export async function GET(req: Request) {
	const auth = await requireRole(["Admin"]);
	if (auth.error) return auth.error;

	const search = new URL(req.url).searchParams.get("search");

	const rows = await db
		.select()
		.from(priorities)
		.where(search ? ilike(priorities.name, `%${search}%`) : undefined)
		.orderBy(asc(priorities.id));

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
	const { id, name } = parsed.data;

	const [dupId] = await db.select({ id: priorities.id }).from(priorities).where(eq(priorities.id, id)).limit(1);
	if (dupId) {
		return NextResponse.json({ error: `Priority id ${id} already exists.` }, { status: 400 });
	}
	const [dupName] = await db.select({ id: priorities.id }).from(priorities).where(ilike(priorities.name, name)).limit(1);
	if (dupName) {
		return NextResponse.json({ error: `A priority named "${name}" already exists.` }, { status: 400 });
	}

	const [created] = await db.insert(priorities).values({ id, name }).returning();
	return NextResponse.json(created, { status: 201 });
}
