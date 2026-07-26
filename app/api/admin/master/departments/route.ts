import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/require-role";
import { db } from "@/db";
import { departments, maintain, deployments } from "@/db/schema";
import { asc, eq, ne, and, ilike } from "drizzle-orm";
import { listRecords, createRecord, NameOnlyConfig } from "@/lib/master-data/name-only";

const cfg: NameOnlyConfig = {
	maxLength: 50,
	entityLabel: "department",
	selectAll: (search) =>
		db.select().from(departments).where(search ? ilike(departments.name, `%${search}%`) : undefined).orderBy(asc(departments.name)),
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
