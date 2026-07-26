// lib/csv-import.ts
import "server-only";
import Papa from "papaparse";

export interface ImportRowError {
	row: number; // 1-based, matches spreadsheet row numbers (header = row 1)
	message: string;
}

export interface ImportResult {
	imported: number;
	skipped: number;
	failed: number;
	errors: ImportRowError[];
}

export interface ParsedCsv {
	headers: string[];
	rows: Record<string, string>[];
}

const MAX_ROWS = 5000;

/**
 * Parses CSV text into header-keyed rows. Headers are trimmed and
 * lower-cased so column matching is case-insensitive and whitespace
 * tolerant (" Name " and "name" both work).
 */
export function parseCsvText(text: string): ParsedCsv | { error: string } {
	if (!text || !text.trim()) {
		return { error: "The uploaded file is empty." };
	}

	const result = Papa.parse<Record<string, string>>(text, {
		header: true,
		skipEmptyLines: true,
		delimiter: ",", // set explicitly — auto-detection has nothing to go on
		// for single-column files and otherwise just emits a benign warning
		transformHeader: (h) => h.trim().toLowerCase(),
	});

	// Papa Parse reports delimiter auto-detection as an "error" even when it
	// succeeded (there's nothing to detect from in a one-column file). That's
	// not a real failure — only bail out on errors of other types.
	const fatalErrors = result.errors.filter((e) => e.type !== "Delimiter");
	if (fatalErrors.length > 0) {
		const first = fatalErrors[0];
		return { error: `CSV parse error: ${first.message} (row ${first.row ?? "?"})` };
	}

	if (result.data.length === 0) {
		return { error: "No data rows found in the file." };
	}

	if (result.data.length > MAX_ROWS) {
		return {
			error: `Too many rows (${result.data.length}). Split into files of ${MAX_ROWS} rows or fewer.`,
		};
	}

	return { headers: result.meta.fields ?? [], rows: result.data };
}

export function trimCell(row: Record<string, string>, key: string): string {
	return (row[key] ?? "").trim();
}

export function newResult(): ImportResult {
	return { imported: 0, skipped: 0, failed: 0, errors: [] };
}
