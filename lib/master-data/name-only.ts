// lib/master-data/name-only.ts
import "server-only";
import { checkStillReferenced, ReferenceCheck } from "./reference-check";

export interface NameOnlyRecord {
	id: number;
	name: string;
}

export interface NameOnlyConfig {
	maxLength: number;
	entityLabel: string; // e.g. "client"
	selectAll: (search?: string) => Promise<NameOnlyRecord[]>;
	selectByNameExcept: (
		name: string,
		exceptId?: number
	) => Promise<NameOnlyRecord | undefined>;
	insert: (name: string) => Promise<NameOnlyRecord>;
	update: (id: number, name: string) => Promise<NameOnlyRecord | undefined>;
	del: (id: number) => Promise<void>;
	referenceChecks: ReferenceCheck[];
}

type Result<T> = { data: T; error?: undefined } | { data?: undefined; error: string };

function validateName(name: string, cfg: NameOnlyConfig): string | null {
	const trimmed = name.trim();
	if (!trimmed) return "Name is required.";
	if (trimmed.length > cfg.maxLength) {
		return `Name exceeds ${cfg.maxLength} characters.`;
	}
	return null;
}

export async function listRecords(
	cfg: NameOnlyConfig,
	search?: string
): Promise<NameOnlyRecord[]> {
	return cfg.selectAll(search);
}

export async function createRecord(
	cfg: NameOnlyConfig,
	rawName: string
): Promise<Result<NameOnlyRecord>> {
	const name = rawName.trim();
	const invalid = validateName(name, cfg);
	if (invalid) return { error: invalid };

	const dup = await cfg.selectByNameExcept(name);
	if (dup) {
		return { error: `A ${cfg.entityLabel} named "${name}" already exists.` };
	}

	const created = await cfg.insert(name);
	return { data: created };
}

export async function updateRecord(
	cfg: NameOnlyConfig,
	id: number,
	rawName: string
): Promise<Result<NameOnlyRecord>> {
	const name = rawName.trim();
	const invalid = validateName(name, cfg);
	if (invalid) return { error: invalid };

	const dup = await cfg.selectByNameExcept(name, id);
	if (dup) {
		return { error: `A ${cfg.entityLabel} named "${name}" already exists.` };
	}

	const updated = await cfg.update(id, name);
	if (!updated) return { error: `${cfg.entityLabel} not found.` };
	return { data: updated };
}

export async function deleteRecord(
	cfg: NameOnlyConfig,
	id: number
): Promise<{ error?: string }> {
	const blocked = await checkStillReferenced(id, cfg.referenceChecks);
	if (blocked) return { error: blocked };
	await cfg.del(id);
	return {};
}
