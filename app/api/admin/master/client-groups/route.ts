// app/api/admin/master/client-groups/route.ts
//
// CRUD for proximity clusters of clients — the gray group-separator rows
// in the Monitoring report (components/pages/Monitoring.tsx). Manually
// maintained: a Scheduler/Admin names a group and tags it South or North;
// individual clients are then assigned into a group from the Clients
// admin page (components/pages/Clients.tsx), not here — this endpoint only
// manages the groups themselves.
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/require-role";
import { db } from "@/db";
import { clientGroups } from "@/db/schema";
import { asc, ilike, and, eq } from "drizzle-orm";

const AREA_VALUES = ["South", "North"] as const;

export async function GET(req: Request) {
	const auth = await requireRole(["Admin"]);
	if (auth.error) return auth.error;

	const searchParams = new URL(req.url).searchParams;
	const search = searchParams.get("search")?.trim();
	const area = searchParams.get("area");

	const conditions = [];
	if (search) conditions.push(ilike(clientGroups.name, `%${search}%`));
	if (area && (AREA_VALUES as readonly string[]).includes(area)) {
		conditions.push(eq(clientGroups.area, area));
	}

	const rows = await db
		.select()
		.from(clientGroups)
		.where(conditions.length ? and(...conditions) : undefined)
		.orderBy(asc(clientGroups.area), asc(clientGroups.name));

	return NextResponse.json(rows);
}

const createBodySchema = z.object({
	name: z.string().trim().min(1, "Name is required.").max(100),
	area: z.enum(AREA_VALUES),
});

export async function POST(req: Request) {
	const auth = await requireRole(["Admin"]);
	if (auth.error) return auth.error;

	const parsed = createBodySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json(
			{ error: parsed.error.issues[0]?.message ?? "Invalid request." },
			{ status: 400 }
		);
	}
	const { name, area } = parsed.data;

	const [dup] = await db
		.select({ id: clientGroups.id })
		.from(clientGroups)
		.where(and(ilike(clientGroups.name, name), eq(clientGroups.area, area)))
		.limit(1);
	if (dup) {
		return NextResponse.json(
			{ error: `A ${area} Area group named "${name}" already exists.` },
			{ status: 400 }
		);
	}

	const [row] = await db.insert(clientGroups).values({ name, area }).returning();
	return NextResponse.json(row, { status: 201 });
}
