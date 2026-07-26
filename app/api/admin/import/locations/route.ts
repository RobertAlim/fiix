// app/api/admin/import/locations/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/require-role";
import { db } from "@/db";
import { clients, locations } from "@/db/schema";
import { parseCsvText, trimCell, newResult } from "@/lib/csv-import";

const bodySchema = z.object({ csv: z.string().min(1) });
const MAX_NAME_LENGTH = 50;

export async function POST(req: Request) {
	const authResult = await requireRole(["Admin"]);
	if (authResult.error) return authResult.error;

	const parsed = bodySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json({ error: "Missing CSV content." }, { status: 400 });
	}

	const parsedCsv = parseCsvText(parsed.data.csv);
	if ("error" in parsedCsv) {
		return NextResponse.json({ error: parsedCsv.error }, { status: 400 });
	}

	if (!parsedCsv.headers.includes("name") || !parsedCsv.headers.includes("client")) {
		return NextResponse.json(
			{ error: `Missing required column(s). Expected: name, client.` },
			{ status: 400 }
		);
	}

	const result = newResult();

	const allClients = await db.select({ id: clients.id, name: clients.name }).from(clients);
	const clientByName = new Map(
		allClients.map((c) => [c.name.trim().toLowerCase(), c.id])
	);

	const existingLocations = await db
		.select({ name: locations.name, clientId: locations.clientId })
		.from(locations);
	const existingKey = new Set(
		existingLocations.map((l) => `${l.clientId}::${l.name.trim().toLowerCase()}`)
	);

	const seenInFile = new Set<string>();
	const toInsert: { name: string; clientId: number }[] = [];

	parsedCsv.rows.forEach((row, idx) => {
		const rowNum = idx + 2;
		const name = trimCell(row, "name");
		const clientName = trimCell(row, "client");

		if (!name || !clientName) {
			result.failed++;
			result.errors.push({ row: rowNum, message: "Missing name or client." });
			return;
		}
		if (name.length > MAX_NAME_LENGTH) {
			result.failed++;
			result.errors.push({
				row: rowNum,
				message: `Name exceeds ${MAX_NAME_LENGTH} characters.`,
			});
			return;
		}

		const clientId = clientByName.get(clientName.toLowerCase());
		if (!clientId) {
			result.failed++;
			result.errors.push({
				row: rowNum,
				message: `Client "${clientName}" not found. Import clients first.`,
			});
			return;
		}

		const key = `${clientId}::${name.toLowerCase()}`;
		if (existingKey.has(key)) {
			result.skipped++;
			result.errors.push({
				row: rowNum,
				message: `Duplicate — "${name}" already exists for client "${clientName}".`,
			});
			return;
		}
		if (seenInFile.has(key)) {
			result.skipped++;
			result.errors.push({
				row: rowNum,
				message: `Duplicate within file — "${name}" for "${clientName}" appears more than once.`,
			});
			return;
		}

		seenInFile.add(key);
		toInsert.push({ name, clientId });
	});

	if (toInsert.length > 0) {
		await db.insert(locations).values(toInsert);
		result.imported = toInsert.length;
	}

	return NextResponse.json(result, { status: 200 });
}
