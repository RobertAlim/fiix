import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/require-role";
import { db } from "@/db";
import { clients, locations, maintain, schedules, deployments, printers, signatories } from "@/db/schema";
import { eq, ne, and, ilike } from "drizzle-orm";
import { updateRecord, deleteRecord, NameOnlyConfig } from "@/lib/master-data/name-only";
import { validateClientGroupArea } from "@/lib/server/client-groups";

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

// MasterDataManager's generic edit form sends an untouched/optional field
// as an empty string, not `undefined` or `null` — so "" has to be accepted
// here too and treated the same as "not set" (i.e. explicitly clearing it),
// on top of the real enum values. Same schema as in ../route.ts's POST —
// duplicated locally rather than shared, matching this pair of files'
// existing pattern of each keeping its own self-contained `cfg`.
const areaSchema = z
	.union([z.enum(["South", "North"]), z.literal(""), z.null()])
	.optional()
	.transform((v) => (v === "" ? null : v));

// `name` alone is the original contract (still exactly what the
// Printers/Locations forms' inline rename uses). `area` and
// `clientGroupId` are new, both optional and independent of `name` and of
// each other — the Clients admin page (components/pages/Clients.tsx)
// sends whichever one field actually changed (e.g. just clientGroupId
// when reassigning a client's group from the grid), not the whole record.
const patchBodySchema = z
	.object({
		name: z.string().optional(),
		area: areaSchema,
		clientGroupId: z.number().int().positive().nullable().optional(),
	})
	.refine((b) => b.name !== undefined || b.area !== undefined || b.clientGroupId !== undefined, {
		message: "Nothing to update.",
	});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const auth = await requireRole(["Admin"]);
	if (auth.error) return auth.error;
	const id = parseId((await params).id);
	if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

	const parsed = patchBodySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
	const { name, area, clientGroupId } = parsed.data;

	// The rename path keeps going through the original name-only helper
	// (duplicate-name check and all) exactly as before, when a name is
	// actually part of this request.
	if (name !== undefined) {
		const result = await updateRecord(cfg, id, name);
		if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
	}

	if (area !== undefined || clientGroupId !== undefined) {
		// The area a Client Group assignment is checked against is whichever
		// is EFFECTIVE after this request — the one just submitted alongside
		// it, if any, otherwise the client's current area on file.
		let effectiveArea: string | null | undefined = area;
		if (effectiveArea === undefined) {
			const [current] = await db
				.select({ area: clients.area })
				.from(clients)
				.where(eq(clients.id, id))
				.limit(1);
			if (!current) return NextResponse.json({ error: "Client not found." }, { status: 404 });
			effectiveArea = current.area;
		}
		if (clientGroupId !== undefined) {
			const groupError = await validateClientGroupArea(clientGroupId, effectiveArea);
			if (groupError) return NextResponse.json({ error: groupError }, { status: 400 });
		}

		await db
			.update(clients)
			.set({
				...(area !== undefined && { area }),
				...(clientGroupId !== undefined && { clientGroupId }),
			})
			.where(eq(clients.id, id));
	}

	const [row] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
	if (!row) return NextResponse.json({ error: "Client not found." }, { status: 404 });
	return NextResponse.json(row);
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
