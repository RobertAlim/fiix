// app/api/admin/import/priorities/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/require-role";
import { db } from "@/db";
import { priorities } from "@/db/schema";
import { parseCsvText, trimCell, newResult } from "@/lib/csv-import";

const bodySchema = z.object({ csv: z.string().min(1) });
const MAX_NAME_LENGTH = 6; // priorities.name is varchar(6) — matches short labels like "High"

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

	if (!parsedCsv.headers.includes("id") || !parsedCsv.headers.includes("name")) {
		return NextResponse.json(
			{
				error:
					'Missing required column(s). Expected: id, name. Priorities use a manually-assigned id (not auto-generated), so both are required.',
			},
			{ status: 400 }
		);
	}

	const result = newResult();

	const existing = await db.select({ id: priorities.id, name: priorities.name }).from(priorities);
	const existingIds = new Set(existing.map((p) => p.id));
	const existingNamesLower = new Set(existing.map((p) => p.name.trim().toLowerCase()));

	const seenIds = new Set<number>();
	const seenNames = new Set<string>();
	const toInsert: { id: number; name: string }[] = [];

	parsedCsv.rows.forEach((row, idx) => {
		const rowNum = idx + 2;
		const idRaw = trimCell(row, "id");
		const name = trimCell(row, "name");

		if (!idRaw || !name) {
			result.failed++;
			result.errors.push({ row: rowNum, message: "Missing id or name." });
			return;
		}

		const id = Number(idRaw);
		if (!Number.isInteger(id) || id <= 0) {
			result.failed++;
			result.errors.push({ row: rowNum, message: `Invalid id "${idRaw}" — must be a positive integer.` });
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

		if (existingIds.has(id)) {
			result.skipped++;
			result.errors.push({ row: rowNum, message: `Duplicate — priority id ${id} already exists.` });
			return;
		}
		if (existingNamesLower.has(name.toLowerCase())) {
			result.skipped++;
			result.errors.push({
				row: rowNum,
				message: `Duplicate — a priority named "${name}" already exists.`,
			});
			return;
		}
		if (seenIds.has(id)) {
			result.skipped++;
			result.errors.push({ row: rowNum, message: `Duplicate within file — id ${id} appears more than once.` });
			return;
		}
		if (seenNames.has(name.toLowerCase())) {
			result.skipped++;
			result.errors.push({
				row: rowNum,
				message: `Duplicate within file — "${name}" appears more than once.`,
			});
			return;
		}

		seenIds.add(id);
		seenNames.add(name.toLowerCase());
		toInsert.push({ id, name });
	});

	if (toInsert.length > 0) {
		await db.insert(priorities).values(toInsert);
		result.imported = toInsert.length;
	}

	return NextResponse.json(result, { status: 200 });
}
