// app/api/admin/master/location-geofences/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { locationGeofences } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/require-role";

const bodySchema = z.object({
	latitude: z.number().min(-90).max(90).optional(),
	longitude: z.number().min(-180).max(180).optional(),
	radiusMeters: z.number().int().min(10).max(5000).optional(),
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
			{ error: "Invalid request", issues: parsed.error.flatten() },
			{ status: 400 }
		);
	}

	const [row] = await db
		.update(locationGeofences)
		.set({ ...parsed.data, updatedAt: new Date() })
		.where(eq(locationGeofences.id, id))
		.returning();

	if (!row) {
		return NextResponse.json({ error: "Not found." }, { status: 404 });
	}
	return NextResponse.json(row);
}

export async function DELETE(
	_req: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	const auth = await requireRole(["Admin"]);
	if (auth.error) return auth.error;

	const id = parseId((await params).id);
	if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

	await db.delete(locationGeofences).where(eq(locationGeofences.id, id));
	return NextResponse.json({ success: true });
}
