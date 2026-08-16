// app/api/admin/master/staff-gps-locations/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { staffGpsLocations, users } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { requireSuperAdmin } from "@/lib/require-role";

const bodySchema = z.object({
	userId: z.number().int().positive(),
	label: z.string().trim().min(1).max(60).default("Office"),
	latitude: z.number().min(-90).max(90),
	longitude: z.number().min(-180).max(180),
	radiusMeters: z.number().int().min(10).max(5000),
});

export async function GET() {
	const auth = await requireSuperAdmin();
	if (auth.error) return auth.error;

	const rows = await db
		.select({
			id: staffGpsLocations.id,
			userId: staffGpsLocations.userId,
			userName: users.firstName,
			userLastName: users.lastName,
			userRole: users.role,
			label: staffGpsLocations.label,
			latitude: staffGpsLocations.latitude,
			longitude: staffGpsLocations.longitude,
			radiusMeters: staffGpsLocations.radiusMeters,
			updatedAt: staffGpsLocations.updatedAt,
		})
		.from(staffGpsLocations)
		.innerJoin(users, eq(users.id, staffGpsLocations.userId))
		.orderBy(asc(users.firstName), asc(users.lastName));

	// Flattened here rather than in the client — MasterDataManager's grid
	// renders flat string columns, not nested objects.
	const data = rows.map((r) => ({
		...r,
		userFullName: `${r.userName} ${r.userLastName} (${r.userRole ?? "No role"})`,
	}));

	return NextResponse.json(data);
}

export async function POST(req: Request) {
	const auth = await requireSuperAdmin();
	if (auth.error) return auth.error;

	const parsed = bodySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "Invalid request", issues: parsed.error.flatten() },
			{ status: 400 }
		);
	}

	const [existing] = await db
		.select({ id: staffGpsLocations.id })
		.from(staffGpsLocations)
		.where(eq(staffGpsLocations.userId, parsed.data.userId))
		.limit(1);
	if (existing) {
		return NextResponse.json(
			{ error: "This user already has a GPS location configured. Edit it instead." },
			{ status: 409 }
		);
	}

	const [row] = await db
		.insert(staffGpsLocations)
		.values(parsed.data)
		.returning();

	return NextResponse.json(row, { status: 201 });
}
