import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/require-role";
import { db } from "@/db";
import { locations, clients } from "@/db/schema";
import { asc, eq, ilike, and } from "drizzle-orm";

const bodySchema = z.object({
	name: z.string().trim().min(1, "Name is required").max(50),
	clientId: z.number().int().positive(),
});

export async function GET(req: Request) {
	const auth = await requireRole(["Admin"]);
	if (auth.error) return auth.error;

	const search = new URL(req.url).searchParams.get("search");

	const rows = await db
		.select({
			id: locations.id,
			name: locations.name,
			clientId: locations.clientId,
			clientName: clients.name,
		})
		.from(locations)
		.innerJoin(clients, eq(clients.id, locations.clientId))
		.where(search ? ilike(locations.name, `%${search}%`) : undefined)
		.orderBy(asc(clients.name), asc(locations.name));

	return NextResponse.json(rows);
}

export async function POST(req: Request) {
	const auth = await requireRole(["Admin"]);
	if (auth.error) return auth.error;

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
		.where(and(eq(locations.clientId, clientId), ilike(locations.name, name)))
		.limit(1);
	if (dup) {
		return NextResponse.json(
			{ error: `A location named "${name}" already exists for this client.` },
			{ status: 400 }
		);
	}

	const [created] = await db.insert(locations).values({ name, clientId }).returning();
	return NextResponse.json(created, { status: 201 });
}
