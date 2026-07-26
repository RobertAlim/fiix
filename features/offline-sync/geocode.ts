import type { GeocodeResult } from "@/validation/maintainSchema";

/**
 * Resolve coordinates into a readable address via our own API (which proxies
 * the geocoding provider — keeps the provider swappable and avoids exposing
 * it to the client). Returns null on any failure; callers must treat a null
 * result as "geocode later during sync", never as a reason to block saving.
 */
export async function reverseGeocode(
	latitude: number,
	longitude: number,
	timeoutMs = 8_000
): Promise<GeocodeResult | null> {
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		const res = await fetch(
			`/api/reverse-geocode?lat=${latitude}&lng=${longitude}`,
			{ signal: controller.signal }
		);
		clearTimeout(timer);
		if (!res.ok) return null;
		const data = (await res.json()) as GeocodeResult;
		if (!data?.formattedAddress) return null;
		return data;
	} catch {
		return null;
	}
}
