import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/require-role";
import { db } from "@/db";
import { clients, locations, maintain, schedules, deployments, printers, signatories } from "@/db/schema";
import { eq, ne, and, ilike } from "drizzle-orm";
import { updateRecord, deleteRecord, NameOnlyConfig } from "@/lib/master-data/name-only";

const cfg: NameOnlyConfig = {
	maxLength: 100,
	entityLabel: "client",
	selectAll: () => db.select().from(clients),
	selectByNameExcept: async (name, exceptId) => {
		const [row] = await db
			.select()
			.from(clients)
			.where(
				exceptId
					? and(ilike(clients.name, name), ne(clients.id, exceptId))
					: ilike(clients.name, name)
			)
			.limit(1);
		return row;
	},
	insert: async (name) => {
		const [row] = await db.insert(clients).values({ name }).returning();
		return row;
	},
	update: async (id, name) => {
		const [row] = await db.update(clients).set({ name }).where(eq(clients.id, id)).returning();
		return row;
	},
	del: async (id) => {
		await db.delete(clients).where(eq(clients.id, id));
	},
	referenceChecks: [
		{ label: "locations", column: locations.clientId },
		{ label: "signatories", column: signatories.clientId },
		{ label: "schedules", column: schedules.clientId },
		{ label: "maintenance records", column: maintain.clientId },
		{ label: "deployments", column: deployments.clientId },
		{ label: "printers", column: printers.deployedClient },
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
