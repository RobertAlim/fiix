// app/api/admin/master/client-groups/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/require-role";
import { db } from "@/db";
import { clientGroups, clients } from "@/db/schema";
import { eq, ne, and, ilike } from "drizzle-orm";

const AREA_VALUES = ["South", "North"] as const;

function parseId(id: string) {
	const n = Number(id);
	return Number.isInteger(n) && n > 0 ? n : null;
}

const patchBodySchema = z
	.object({
		name: z.string().trim().min(1).max(100).optional(),
		area: z.enum(AREA_VALUES).optional(),
	})
	.refine((b) => b.name !== undefined || b.area !== undefined, {
		message: "Nothing to update.",
	});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const auth = await requireRole(["Admin"]);
	if (auth.error) return auth.error;
	const id = parseId((await params).id);
	if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

	const parsed = patchBodySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json(
			{ error: parsed.error.issues[0]?.message ?? "Invalid request." },
			{ status: 400 }
		);
	}
	const { name, area } = parsed.data;

	const [existing] = await db
		.select()
		.from(clientGroups)
		.where(eq(clientGroups.id, id))
		.limit(1);
	if (!existing) return NextResponse.json({ error: "Client Group not found." }, { status: 404 });

	// Changing a group's Area after clients are already assigned to it would
	// silently move every one of those clients into the other Area's
	// section of the Monitoring report — surprising, and very likely not
	// what was intended by an edit that only meant to fix the group's name
	// or rebalance its area going forward. Refuse rather than guess; the
	// group can be recreated (or emptied first) if the Area genuinely needs
	// to change.
	if (area !== undefined && area !== existing.area) {
		const [member] = await db
			.select({ id: clients.id })
			.from(clients)
			.where(eq(clients.clientGroupId, id))
			.limit(1);
		if (member) {
			return NextResponse.json(
				{
					error:
						"This group has clients assigned to it — reassign or unassign them before changing its Area.",
				},
				{ status: 409 }
			);
		}
	}

	const effectiveName = name ?? existing.name;
	const effectiveArea = area ?? existing.area;
	const [dup] = await db
		.select({ id: clientGroups.id })
		.from(clientGroups)
		.where(
			and(
				ilike(clientGroups.name, effectiveName),
				eq(clientGroups.area, effectiveArea),
				ne(clientGroups.id, id)
			)
		)
		.limit(1);
	if (dup) {
		return NextResponse.json(
			{ error: `A ${effectiveArea} Area group named "${effectiveName}" already exists.` },
			{ status: 400 }
		);
	}

	const [row] = await db
		.update(clientGroups)
		.set({
			...(name !== undefined && { name }),
			...(area !== undefined && { area }),
		})
		.where(eq(clientGroups.id, id))
		.returning();

	return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const auth = await requireRole(["Admin"]);
	if (auth.error) return auth.error;
	const id = parseId((await params).id);
	if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

	// clients.clientGroupId -> clientGroups.id is ON DELETE SET NULL (see
	// db/migrations/0062), so deleting a group is always safe at the
	// database level — every client that was in it just becomes ungrouped
	// (still shows under its own Area, no separator). No reference-check
	// block needed here, unlike most other master-data deletes in this app.
	const result = await db.delete(clientGroups).where(eq(clientGroups.id, id)).returning({ id: clientGroups.id });
	if (result.length === 0) {
		return NextResponse.json({ error: "Client Group not found." }, { status: 404 });
	}
	return NextResponse.json({ success: true });
}
