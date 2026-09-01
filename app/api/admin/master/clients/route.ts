import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/require-role";
import { db } from "@/db";
import {
	clients,
	clientGroups,
	locations,
	maintain,
	schedules,
	deployments,
	printers,
	signatories,
} from "@/db/schema";
import { asc, eq, ne, and, ilike } from "drizzle-orm";
import { listRecords, createRecord, NameOnlyConfig } from "@/lib/master-data/name-only";
import { validateClientGroupArea } from "@/lib/server/client-groups";

const cfg: NameOnlyConfig = {
	maxLength: 100,
	entityLabel: "client",
	// A plain SELECT (no explicit column list) returns every column the
	// `clients` table declares — area and clientGroupId included — so the
	// Clients admin page (components/pages/Clients.tsx) gets those for
	// free from this same endpoint the Printers/Locations forms already
	// use as a simple id+name source; it just ignores the extra fields.
	// clientGroupName is added with a join since that's not a column on
	// `clients` itself.
	selectAll: (search) =>
		db
			.select({
				id: clients.id,
				name: clients.name,
				area: clients.area,
				clientGroupId: clients.clientGroupId,
				clientGroupName: clientGroups.name,
			})
			.from(clients)
			.leftJoin(clientGroups, eq(clientGroups.id, clients.clientGroupId))
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

// MasterDataManager's generic edit form (used by the Clients admin page for
// this "area" radio-card field) sends an untouched/optional field as an
// empty string, not `undefined` or `null` — so "" has to be accepted here
// too and treated the same as "not set", on top of the real enum values.
const areaSchema = z
	.union([z.enum(["South", "North"]), z.literal(""), z.null()])
	.optional()
	.transform((v) => (v === "" ? null : v));

const createBodySchema = z.object({
	name: z.string(),
	// Both optional and independent of `name` — the Printers/Locations
	// "add a client on the fly" flow only ever sends `name`, and that
	// keeps working exactly as before. Only the Clients admin page
	// (components/pages/Clients.tsx) sends these too.
	area: areaSchema,
	clientGroupId: z.number().int().positive().nullable().optional(),
});

export async function POST(req: Request) {
	const auth = await requireRole(["Admin"]);
	if (auth.error) return auth.error;
	const parsed = createBodySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: "Missing name." }, { status: 400 });
	const { name, area, clientGroupId } = parsed.data;

	if (clientGroupId) {
		const groupError = await validateClientGroupArea(clientGroupId, area ?? null);
		if (groupError) return NextResponse.json({ error: groupError }, { status: 400 });
	}

	const result = await createRecord(cfg, name);
	if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });

	if (area !== undefined || clientGroupId !== undefined) {
		const [updated] = await db
			.update(clients)
			.set({
				...(area !== undefined && { area }),
				...(clientGroupId !== undefined && { clientGroupId }),
			})
			.where(eq(clients.id, result.data!.id))
			.returning();
		return NextResponse.json(updated, { status: 201 });
	}

	return NextResponse.json(result.data, { status: 201 });
}
