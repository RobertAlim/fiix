// lib/importers/name-only.ts
import "server-only";
import { parseCsvText, trimCell, newResult, ImportResult } from "@/lib/csv-import";

/**
 * Imports a CSV with a single "name" column into a table shaped like
 * { id: serial, name: varchar(maxLength) } — covers Clients, Departments,
 * Models, and Parts, which are otherwise identical in structure.
 */
export async function importNameOnlyTable(
	csvText: string,
	opts: {
		maxLength: number;
		entityLabel: string; // e.g. "client", used in error messages
		selectExistingNames: () => Promise<{ name: string }[]>;
		insertNames: (names: string[]) => Promise<void>;
	}
): Promise<ImportResult | { error: string }> {
	const parsed = parseCsvText(csvText);
	if ("error" in parsed) return parsed;

	if (!parsed.headers.includes("name")) {
		return { error: `Missing required column "name".` };
	}

	const result = newResult();
	const existing = await opts.selectExistingNames();
	const existingLower = new Set(existing.map((r) => r.name.trim().toLowerCase()));
	const seenInFile = new Set<string>();
	const toInsert: string[] = [];

	parsed.rows.forEach((row, idx) => {
		const rowNum = idx + 2; // +1 for header row, +1 for 1-based index
		const name = trimCell(row, "name");

		if (!name) {
			result.failed++;
			result.errors.push({ row: rowNum, message: "Missing name." });
			return;
		}
		if (name.length > opts.maxLength) {
			result.failed++;
			result.errors.push({
				row: rowNum,
				message: `Name exceeds ${opts.maxLength} characters.`,
			});
			return;
		}

		const key = name.toLowerCase();
		if (existingLower.has(key)) {
			result.skipped++;
			result.errors.push({
				row: rowNum,
				message: `Duplicate — a ${opts.entityLabel} named "${name}" already exists.`,
			});
			return;
		}
		if (seenInFile.has(key)) {
			result.skipped++;
			result.errors.push({
				row: rowNum,
				message: `Duplicate within file — "${name}" appears more than once.`,
			});
			return;
		}

		seenInFile.add(key);
		toInsert.push(name);
	});

	if (toInsert.length > 0) {
		await opts.insertNames(toInsert);
		result.imported = toInsert.length;
	}

	return result;
}
