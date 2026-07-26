import { getOfflineDB } from "./local-db";

/** Thrown when data is requested offline (or after a failed fetch) and
 * nothing has ever been cached for that key — callers use this to show a
 * "connect once to cache this" message instead of a generic network error. */
export class OfflineCacheMissError extends Error {
	constructor(public readonly cacheKey: string) {
		super(
			`No cached data for "${cacheKey}" and the device is offline or the ` +
				`request failed. Connect to the internet once to cache it.`
		);
		this.name = "OfflineCacheMissError";
	}
}

async function readCache<T>(key: string): Promise<T | null> {
	try {
		const row = await getOfflineDB().refCache.get(key);
		return row ? (JSON.parse(row.json) as T) : null;
	} catch {
		return null; // corrupt entry or IndexedDB unavailable — treat as a miss
	}
}

async function writeCache(key: string, value: unknown): Promise<void> {
	try {
		await getOfflineDB().refCache.put({
			key,
			json: JSON.stringify(value),
			updatedAt: Date.now(),
		});
	} catch {
		// Best-effort — a failed cache write must never block returning fresh
		// data to the caller.
	}
}

/**
 * Fetch JSON with an offline-first fallback: online, a fresh network result
 * always wins and refreshes the cache; offline (or the request itself
 * throws), the last cached value is returned instead. Only throws
 * OfflineCacheMissError when there's truly nothing to fall back to.
 */
export async function cachedJsonFetch<T>(
	url: string,
	cacheKey: string
): Promise<T> {
	const online = typeof navigator === "undefined" || navigator.onLine;

	if (online) {
		try {
			const res = await fetch(url);
			if (res.ok) {
				const data = (await res.json()) as T;
				await writeCache(cacheKey, data);
				return data;
			}
			// A real HTTP error (401/500/...) — don't mask it with stale cached
			// data silently; but if we have something cached, prefer showing
			// that over a hard failure so the technician isn't blocked.
			const cached = await readCache<T>(cacheKey);
			if (cached !== null) return cached;
			throw new Error(`Request failed (${res.status}) for ${cacheKey}`);
		} catch (err) {
			const cached = await readCache<T>(cacheKey);
			if (cached !== null) return cached;
			if (err instanceof Error) throw err;
			throw new OfflineCacheMissError(cacheKey);
		}
	}

	const cached = await readCache<T>(cacheKey);
	if (cached !== null) return cached;
	throw new OfflineCacheMissError(cacheKey);
}

// ---------------------------------------------------------------------------
// Typed wrappers for the specific reference data the Maintenance page needs.
// ---------------------------------------------------------------------------

export interface CachedClient {
	id: number;
	name: string;
}

export function fetchClientsCached(): Promise<CachedClient[]> {
	return cachedJsonFetch<CachedClient[]>("/api/clients", "clients");
}

export interface DropdownItem {
	value: string;
	label: string;
}

export function fetchPartsCached(): Promise<DropdownItem[]> {
	return cachedJsonFetch<DropdownItem[]>("/api/dropdown/parts", "dropdown:parts");
}

export function fetchStatusCached(): Promise<DropdownItem[]> {
	return cachedJsonFetch<DropdownItem[]>(
		"/api/dropdown/status",
		"dropdown:status"
	);
}

/** Shape returned by GET /api/maintain?serialNo=... — printer/deployment
 * context plus the client's signatories, everything the Maintenance form
 * needs to prefill for one printer. */
export interface MaintainLookup {
	maintenanceData: {
		id: number;
		deploymentId: number;
		serialNo: string;
		modelId: number;
		model: string;
		clientId: number;
		client: string;
		locationId: number;
		location: string;
		departmentId: number;
		department: string;
	};
	signatories: DropdownItem[];
}

function maintainLookupKey(serialNo: string): string {
	return `maintain-lookup:${serialNo}`;
}

export function fetchMaintainLookupCached(
	serialNo: string
): Promise<MaintainLookup> {
	return cachedJsonFetch<MaintainLookup>(
		`/api/maintain?serialNo=${encodeURIComponent(serialNo)}`,
		maintainLookupKey(serialNo)
	);
}

/**
 * Warm the offline cache for a technician's whole itinerary — one lookup per
 * assigned printer, plus the shared reference lists (clients, parts,
 * statuses). Call this while online, right after the itinerary loads, so the
 * Maintenance page works even if connectivity drops before the technician
 * opens each report. Best-effort and silent: an unreachable printer or a
 * mid-fetch disconnect just leaves that one entry uncached rather than
 * failing the whole warm-up.
 */
export async function prefetchItineraryData(
	scheduleDetails: { printer?: { serialNo?: string | null } | null }[]
): Promise<{ cachedPrinters: number; totalPrinters: number }> {
	if (typeof navigator !== "undefined" && !navigator.onLine) {
		return { cachedPrinters: 0, totalPrinters: 0 };
	}

	const serialNos = Array.from(
		new Set(
			scheduleDetails
				.map((d) => d.printer?.serialNo)
				.filter((s): s is string => Boolean(s))
		)
	);

	const results = await Promise.allSettled([
		...serialNos.map((serialNo) => fetchMaintainLookupCached(serialNo)),
		fetchClientsCached(),
		fetchPartsCached(),
		fetchStatusCached(),
	]);

	const cachedPrinters = results
		.slice(0, serialNos.length)
		.filter((r) => r.status === "fulfilled").length;

	return { cachedPrinters, totalPrinters: serialNos.length };
}
