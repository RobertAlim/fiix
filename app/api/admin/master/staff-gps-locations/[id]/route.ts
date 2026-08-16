// app/api/admin/master/staff-gps-locations/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { staffGpsLocations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSuperAdmin } from "@/lib/require-role";

const bodySchema = z.object({
	label: z.string().trim().min(1).max(60).optional(),
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
	const auth = await requireSuperAdmin();
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
		.update(staffGpsLocations)
		.set({ ...parsed.data, updatedAt: new Date() })
		.where(eq(staffGpsLocations.id, id))
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
	const auth = await requireSuperAdmin();
	if (auth.error) return auth.error;

	const id = parseId((await params).id);
	if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

	await db.delete(staffGpsLocations).where(eq(staffGpsLocations.id, id));
	return NextResponse.json({ success: true });
}
