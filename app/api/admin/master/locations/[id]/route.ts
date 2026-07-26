import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/require-role";
import { db } from "@/db";
import { locations, clients, deployments, maintain, schedules } from "@/db/schema";
import { eq, ilike, and, ne } from "drizzle-orm";
import { checkStillReferenced } from "@/lib/master-data/reference-check";

const bodySchema = z.object({
	name: z.string().trim().min(1, "Name is required").max(50),
	clientId: z.number().int().positive(),
});

function parseId(id: string) {
	const n = Number(id);
	return Number.isInteger(n) && n > 0 ? n : null;
}

export async function PATCH(
	req: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	const auth = await requireRole(["Admin"]);
	if (auth.error) return auth.error;

	const id = parseId((await params).id);
	if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

	const parsed = bodySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json(
			{ error: parsed.error.issues[0]?.message ?? "Invalid input." },
			{ status: 400 }
		);
	}
	const { name, clientId } = parsed.data;

	const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId)).limit(1);
	if (!client) {
		return NextResponse.json({ error: "Selected client does not exist." }, { status: 400 });
	}

	const [dup] = await db
		.select({ id: locations.id })
		.from(locations)
		.where(and(eq(locations.clientId, clientId), ilike(locations.name, name), ne(locations.id, id)))
		.limit(1);
	if (dup) {
		return NextResponse.json(
			{ error: `A location named "${name}" already exists for this client.` },
			{ status: 400 }
		);
	}

	const [updated] = await db
		.update(locations)
		.set({ name, clientId })
		.where(eq(locations.id, id))
		.returning();
	if (!updated) return NextResponse.json({ error: "Location not found." }, { status: 404 });
	return NextResponse.json(updated);
}

export async function DELETE(
	_req: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	const auth = await requireRole(["Admin"]);
	if (auth.error) return auth.error;

	const id = parseId((await params).id);
	if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

	const blocked = await checkStillReferenced(id, [
		{ label: "deployments", column: deployments.locationId },
		{ label: "maintenance records", column: maintain.locationId },
		{ label: "schedules", column: schedules.locationId },
	]);
	if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });

	await db.delete(locations).where(eq(locations.id, id));
	return NextResponse.json({ success: true });
}
