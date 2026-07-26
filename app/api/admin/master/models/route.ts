import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/require-role";
import { db } from "@/db";
import { models, deployments } from "@/db/schema";
import { asc, eq, ne, and, ilike } from "drizzle-orm";
import { listRecords, createRecord, NameOnlyConfig } from "@/lib/master-data/name-only";

const cfg: NameOnlyConfig = {
	maxLength: 20,
	entityLabel: "model",
	selectAll: (search) =>
		db.select().from(models).where(search ? ilike(models.name, `%${search}%`) : undefined).orderBy(asc(models.name)),
	selectByNameExcept: async (name, exceptId) => {
		const [row] = await db.select().from(models).where(
			exceptId ? and(ilike(models.name, name), ne(models.id, exceptId)) : ilike(models.name, name)
		).limit(1);
		return row;
	},
	insert: async (name) => {
		const [row] = await db.insert(models).values({ name }).returning();
		return row;
	},
	update: async (id, name) => {
		const [row] = await db.update(models).set({ name }).where(eq(models.id, id)).returning();
		return row;
	},
	del: async (id) => { await db.delete(models).where(eq(models.id, id)); },
	referenceChecks: [{ label: "deployments", column: deployments.modelId }],
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
