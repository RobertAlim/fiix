// lib/errors.ts
export function ensureError(e: unknown): Error {
	if (e instanceof Error) return e;
	if (typeof e === "string") return new Error(e);
	try {
		return new Error(JSON.stringify(e));
	} catch {
		return new Error("Unknown error");
	}
}

export function getErrorMessage(e: unknown): string {
	return ensureError(e).message;
}
