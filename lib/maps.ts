// lib/maps.ts
//
// Google Maps deep links, built with the official Maps URLs API
// (https://www.google.com/maps/dir/?api=1&...). No API key, no SDK, no
// billing account — the URL is just opened in a new tab and Google's own
// app/site does the routing. That's deliberate: every consumer of this
// helper only needs "show me the way from A to B", never programmatic
// route data, so pulling in the Directions/Routes API (which does need a
// key and is billed per request) would buy nothing.
//
// Coordinates come from the `locationGeofences` table — the same pins the
// Time In geofence check already validates against, so a route drawn here
// always ends exactly where a technician is required to be standing.

/** Maps URLs API travel modes. `two-wheeler` is Google's name for
 * motorized two-wheelers (motorcycles) — distinct from `bicycling`, which
 * is human-powered. */
export type TravelMode =
	| "two-wheeler"
	| "driving"
	| "walking"
	| "bicycling"
	| "transit";

/** Motorcycle. The entire field fleet rides one, so this is the default
 * everywhere rather than something the user has to select each time. */
export const DEFAULT_TRAVEL_MODE: TravelMode = "two-wheeler";

export interface LatLng {
	latitude: number;
	longitude: number;
}

/** True when a coordinate pair is present and numerically usable. Rows in
 * `locationGeofences` are the only source, but a location may simply not
 * have a geofence configured yet — callers use this to disable the
 * navigate control instead of opening a broken map. */
export function hasCoordinates(
	point: Partial<LatLng> | null | undefined
): point is LatLng {
	return (
		!!point &&
		typeof point.latitude === "number" &&
		typeof point.longitude === "number" &&
		Number.isFinite(point.latitude) &&
		Number.isFinite(point.longitude)
	);
}

function formatPoint(point: LatLng): string {
	// Maps accepts "lat,lng" directly. Six decimals is ~11 cm of precision —
	// far more than a geofence radius needs, and it keeps the URL short.
	return `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`;
}

/**
 * Directions URL from one coordinate to another.
 *
 * @param origin      where the ride starts (previous itinerary stop), or
 *                     `null` for a stop with no preceding leg (the first
 *                     stop of a day) — Google Maps falls back to the
 *                     device's current location as the starting point when
 *                     the `origin` param is omitted entirely.
 * @param destination where it ends (the stop whose icon was clicked)
 */
export function googleMapsDirectionsUrl(
	origin: LatLng | null,
	destination: LatLng,
	travelMode: TravelMode = DEFAULT_TRAVEL_MODE
): string {
	const params = new URLSearchParams({
		api: "1",
		destination: formatPoint(destination),
		travelmode: travelMode,
	});
	if (origin) params.set("origin", formatPoint(origin));
	return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Opens the directions in a new tab. `noopener,noreferrer` is not
 * optional here — without it the opened tab gets a handle back to this
 * one via window.opener.
 */
export function openGoogleMapsDirections(
	origin: LatLng | null,
	destination: LatLng,
	travelMode: TravelMode = DEFAULT_TRAVEL_MODE
): void {
	window.open(
		googleMapsDirectionsUrl(origin, destination, travelMode),
		"_blank",
		"noopener,noreferrer"
	);
}
