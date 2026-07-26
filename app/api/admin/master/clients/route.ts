import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/require-role";
import { db } from "@/db";
import { clients, locations, maintain, schedules, deployments, printers, signatories } from "@/db/schema";
import { asc, eq, ne, and, ilike } from "drizzle-orm";
import { listRecords, createRecord, NameOnlyConfig } from "@/lib/master-data/name-only";

const cfg: NameOnlyConfig = {
	maxLength: 100,
	entityLabel: "client",
	selectAll: (search) =>
		db
			.select()
			.from(clients)
			.where(search ? ilike(clients.name, `%${search}%`) : undefined)
			.orderBy(asc(clients.name)),
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
