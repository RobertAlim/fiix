import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/require-role";
import { db } from "@/db";
import { parts, replace, repair } from "@/db/schema";
import { asc, eq, ne, and, ilike } from "drizzle-orm";
import { listRecords, createRecord, NameOnlyConfig } from "@/lib/master-data/name-only";

const cfg: NameOnlyConfig = {
	maxLength: 50,
	entityLabel: "part",
	selectAll: (search) =>
		db.select().from(parts).where(search ? ilike(parts.name, `%${search}%`) : undefined).orderBy(asc(parts.name)),
	selectByNameExcept: async (name, exceptId) => {
		const [row] = await db.select().from(parts).where(
			exceptId ? and(ilike(parts.name, name), ne(parts.id, exceptId)) : ilike(parts.name, name)
		).limit(1);
		return row;
	},
	insert: async (name) => {
		const [row] = await db.insert(parts).values({ name }).returning();
		return row;
	},
	update: async (id, name) => {
		const [row] = await db.update(parts).set({ name }).where(eq(parts.id, id)).returning();
		return row;
	},
	del: async (id) => { await db.delete(parts).where(eq(parts.id, id)); },
	referenceChecks: [
		{ label: "replacement records", column: replace.partId },
		{ label: "repair records", column: repair.partId },
	],
};

export async function GET(req: Request) {
	const auth = await requireRole(["Admin"]);
	if (auth.error) return auth.error;
	const search = new URL(req.url).searchParams.get("search") ?? undefined;
	return NextResponse.json(await listRecords(cfg, search));
}

export async function POST(req: Request) {
	const auth = await requireRole(["Admin"]);
	if (auth.error) return auth.error;
	const parsed = z.object({ name: z.string() }).safeParse(await req.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: "Missing name." }, { status: 400 });
	const result = await createRecord(cfg, parsed.data.name);
	if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
	return NextResponse.json(result.data, { status: 201 });
}
