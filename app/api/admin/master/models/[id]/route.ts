import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/require-role";
import { db } from "@/db";
import { models, deployments } from "@/db/schema";
import { eq, ne, and, ilike } from "drizzle-orm";
import { updateRecord, deleteRecord, NameOnlyConfig } from "@/lib/master-data/name-only";

const cfg: NameOnlyConfig = {
	maxLength: 20,
	entityLabel: "model",
	selectAll: () => db.select().from(models),
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

function parseId(id: string) {
	const n = Number(id);
	return Number.isInteger(n) && n > 0 ? n : null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const auth = await requireRole(["Admin"]);
	if (auth.error) return auth.error;
	const id = parseId((await params).id);
	if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
	const parsed = z.object({ name: z.string() }).safeParse(await req.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: "Missing name." }, { status: 400 });
	const result = await updateRecord(cfg, id, parsed.data.name);
	if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
	return NextResponse.json(result.data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const auth = await requireRole(["Admin"]);
	if (auth.error) return auth.error;
	const id = parseId((await params).id);
	if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
	const result = await deleteRecord(cfg, id);
	if (result.error) return NextResponse.json({ error: result.error }, { status: 409 });
	return NextResponse.json({ success: true });
}
