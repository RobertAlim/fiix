import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/require-role";
import { importNameOnlyTable } from "@/lib/importers/name-only";
import { db } from "@/db";
import { clients } from "@/db/schema";

const bodySchema = z.object({ csv: z.string().min(1) });

export async function POST(req: Request) {
	const authResult = await requireRole(["Admin"]);
	if (authResult.error) return authResult.error;

	const parsed = bodySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json({ error: "Missing CSV content." }, { status: 400 });
	}

	const result = await importNameOnlyTable(parsed.data.csv, {
		maxLength: 100,
		entityLabel: "client",
		selectExistingNames: () => db.select({ name: clients.name }).from(clients),
		insertNames: async (names) => {
			await db.insert(clients).values(names.map((name) => ({ name })));
		},
	});

	if ("error" in result) {
		return NextResponse.json({ error: result.error }, { status: 400 });
	}
	return NextResponse.json(result, { status: 200 });
}
