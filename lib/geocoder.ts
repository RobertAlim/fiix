// Server-side reverse geocoding. Proxied through our API so the provider is
// swappable and never exposed to clients. Defaults to OpenStreetMap Nominatim
// (no key required); override with GEOCODER_BASE_URL / GEOCODER_USER_AGENT.
import "server-only";

export interface GeocodeAddress {
	locationName: string;
	formattedAddress: string;
	city: string | null;
	province: string | null;
	country: string | null;
	postalCode: string | null;
}

import { env } from "@/lib/env";

const BASE_URL = env.GEOCODER_BASE_URL ?? "https://nominatim.openstreetmap.org";
const USER_AGENT =
	env.GEOCODER_USER_AGENT ??
	"Fiix-Maintenance/1.0 (Fruitbean Ink Refilling Station)";

interface NominatimResponse {
	display_name?: string;
	address?: Record<string, string>;
}

/**
 * Resolve coordinates to a readable address. Returns null on any failure —
 * callers must treat geocoding as best-effort (coordinates are the source of
 * truth and are always stored regardless).
 */
export async function reverseGeocodeServer(
	latitude: number,
	longitude: number
): Promise<GeocodeAddress | null> {
	try {
		const url = `${BASE_URL}/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1&accept-language=en`;
		const res = await fetch(url, {
			headers: { "User-Agent": USER_AGENT },
			// Nominatim results for fixed coordinates are stable; cache to
			// respect the provider's usage policy.
			next: { revalidate: 86_400 },
		});
		if (!res.ok) return null;
		const data = (await res.json()) as NominatimResponse;
		if (!data.display_name) return null;

		const a = data.address ?? {};
		const city =
			a.city ?? a.town ?? a.municipality ?? a.village ?? null;
		const province = a.state ?? a.province ?? a.region ?? null;
		const localArea =
			a.residential ??
			a.neighbourhood ??
			a.suburb ??
			a.quarter ??
			a.hamlet ??
			null;
		const barangay = a.village ?? a.suburb ?? null;

		// Short name in the "Camella Del Rio Talon Dos Las Piñas City" style:
		// local area + barangay/suburb + city, deduplicated.
		const nameParts = [localArea, barangay, city].filter(
			(part, i, arr): part is string =>
				!!part && arr.indexOf(part) === i
		);
		const locationName =
			nameParts.length > 0 ? nameParts.join(" ") : data.display_name;

		return {
			locationName: locationName.slice(0, 500),
			formattedAddress: data.display_name.slice(0, 1000),
			city,
			province,
			country: a.country ?? null,
			postalCode: a.postcode ?? null,
		};
	} catch {
		return null;
	}
}
