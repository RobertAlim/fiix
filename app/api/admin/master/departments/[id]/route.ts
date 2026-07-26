import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/require-role";
import { db } from "@/db";
import { departments, maintain, deployments } from "@/db/schema";
import { eq, ne, and, ilike } from "drizzle-orm";
import { updateRecord, deleteRecord, NameOnlyConfig } from "@/lib/master-data/name-only";

const cfg: NameOnlyConfig = {
	maxLength: 50,
	entityLabel: "department",
	selectAll: () => db.select().from(departments),
	selectByNameExcept: async (name, exceptId) => {
		const [row] = await db.select().from(departments).where(
			exceptId ? and(ilike(departments.name, name), ne(departments.id, exceptId)) : ilike(departments.name, name)
		).limit(1);
		return row;
	},
	insert: async (name) => {
		const [row] = await db.insert(departments).values({ name }).returning();
		return row;
	},
	update: async (id, name) => {
		const [row] = await db.update(departments).set({ name }).where(eq(departments.id, id)).returning();
		return row;
	},
	del: async (id) => { await db.delete(departments).where(eq(departments.id, id)); },
	referenceChecks: [
		{ label: "deployments", column: deployments.departmentId },
		{ label: "maintenance records", column: maintain.departmentId },
	],
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
