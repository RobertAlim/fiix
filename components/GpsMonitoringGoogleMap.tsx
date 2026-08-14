/// <reference types="google.maps" />
"use client";

// components/GpsMonitoringGoogleMap.tsx
//
// Replaces the earlier Leaflet + OpenStreetMap implementation. Unlike
// lib/maps.ts's keyless "open a link in a new tab" approach (still used
// elsewhere — the Itinerary navigate buttons, the Client Locations route
// planner), this component renders the map INLINE and needs to draw an
// actual routed polyline with distance/ETA, which the keyless Maps URLs
// API cannot do: it can only hand off to Google's own app/site.
//
// THIS REQUIRES A GOOGLE MAPS API KEY.
// Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in the environment, with billing
// enabled on the associated Google Cloud project and the "Maps JavaScript
// API" enabled (the newer Routes-library motorcycle routing used below is
// part of that same product, not a separate API to enable). See
// https://developers.google.com/maps/documentation/javascript/get-api-key
//
// Motorcycle routing uses TWO_WHEELER — Google's actual name for
// motorized two-wheelers, via the newer `routes` library's
// `Route.computeRoutes` (NOT the older DirectionsService, whose travelMode
// enum only ever supported DRIVING/WALKING/BICYCLING/TRANSIT and has no
// two-wheeler option at all). Google's terms require displaying a beta
// warning for two-wheel routes — that's the note rendered below the map.
import { useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { AlertTriangle, Clock, Route as RouteIcon } from "lucide-react";

export interface MapPoint {
	label: string;
	latitude: number;
	longitude: number;
}

export interface TrailPoint {
	latitude: number;
	longitude: number;
}

const MANILA_CENTER = { lat: 14.5995, lng: 120.9842 };

// Matches the color coding used before (and still used by the itinerary/
// route-planner navigate icons): indigo = the technician's live position,
// gray = where the day started or the last completed stop, green = the
// next assigned destination. The trail below uses the technician color
// too (it's the same person's path) but thinner and dashed, so it reads
// as "where they've been" rather than competing visually with the
// solid, more prominent planned-route line.
const MARKER_COLORS = {
	technician: "#4f46e5",
	origin: "#6b7280",
	destination: "#16a34a",
} as const;

function coloredDotIcon(color: string): google.maps.Symbol {
	return {
		path: google.maps.SymbolPath.CIRCLE,
		scale: 8,
		fillColor: color,
		fillOpacity: 1,
		strokeColor: "#ffffff",
		strokeWeight: 2,
	};
}

let loaderPromise: Promise<void> | null = null;
/** setOptions() must be called exactly once, before the first
 * importLibrary() call — the module-level promise makes every consumer of
 * this component share that one initialization instead of racing to call
 * setOptions twice (which throws). */
function loadGoogleMaps(apiKey: string): Promise<void> {
	if (!loaderPromise) {
		setOptions({ key: apiKey, v: "weekly" });
		loaderPromise = Promise.all([
			importLibrary("maps"),
			// Requested up front, not lazily inside the route effect: the
			// route effect can fire before this resolves otherwise (e.g. a
			// technician who already has a route the moment the page loads).
			importLibrary("routes"),
		]).then(() => undefined);
	}
	return loaderPromise;
}

interface RouteSummary {
	distanceText: string;
	durationText: string;
	usedFallbackMode: boolean;
}

export function GpsMonitoringGoogleMap({
	technician,
	origin,
	destination,
	trail,
	onRouteComputed,
}: {
	technician: MapPoint | null;
	origin: MapPoint | null;
	destination: MapPoint | null;
	/** The technician's actual GPS fixes for the day, oldest first — the
	 * literal path they've traveled, distinct from origin/destination
	 * above (which is a PLANNED stop-to-stop line, not a record of real
	 * movement). Optional/undefined-safe so existing callers that haven't
	 * been updated yet don't break. */
	trail?: TrailPoint[];
	/** Reports distance/ETA text up to the parent, so it can render it
	 * outside the map (e.g. in the card header) instead of only as an
	 * on-map popover. */
	onRouteComputed?: (summary: RouteSummary | null) => void;
}) {
	const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

	const mapDivRef = useRef<HTMLDivElement | null>(null);
	const mapRef = useRef<google.maps.Map | null>(null);
	const technicianMarkerRef = useRef<google.maps.Marker | null>(null);
	const originMarkerRef = useRef<google.maps.Marker | null>(null);
	const destinationMarkerRef = useRef<google.maps.Marker | null>(null);
	const polylineRef = useRef<google.maps.Polyline | null>(null);
	const trailPolylineRef = useRef<google.maps.Polyline | null>(null);
	const routeRequestSeq = useRef(0);

	const [loadError, setLoadError] = useState<string | null>(null);
	const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null);

	// --- Load the API and create the map once ---------------------------
	useEffect(() => {
		if (!apiKey) return;
		let cancelled = false;

		loadGoogleMaps(apiKey)
			.then(() => {
				if (cancelled || !mapDivRef.current || mapRef.current) return;
				mapRef.current = new google.maps.Map(mapDivRef.current, {
					center: MANILA_CENTER,
					zoom: 14,
					mapTypeControl: false,
					streetViewControl: false,
					fullscreenControl: false,
				});
			})
			.catch((err) => {
				console.error("Google Maps failed to load:", err);
				if (!cancelled) {
					setLoadError(
						"Could not load Google Maps. Check that NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set and valid, and that billing is enabled on the associated Google Cloud project."
					);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [apiKey]);

	// --- Keep the technician marker in sync ------------------------------
	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;

		if (!technician) {
			technicianMarkerRef.current?.setMap(null);
			technicianMarkerRef.current = null;
			return;
		}

		const position = { lat: technician.latitude, lng: technician.longitude };
		if (!technicianMarkerRef.current) {
			technicianMarkerRef.current = new google.maps.Marker({
				map,
				position,
				title: technician.label,
				icon: coloredDotIcon(MARKER_COLORS.technician),
				zIndex: 3,
			});
		} else {
			technicianMarkerRef.current.setPosition(position);
		}
		// Follow the technician without resetting whatever zoom level the
		// Admin has set — same reasoning as the old Leaflet RecenterOnMove.
		map.panTo(position);
	});

	// --- Trail: the technician's actual path today, from real pings ------
	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;

		if (!trail || trail.length < 2) {
			trailPolylineRef.current?.setMap(null);
			trailPolylineRef.current = null;
			return;
		}

		const path = trail.map((p) => ({ lat: p.latitude, lng: p.longitude }));
		if (!trailPolylineRef.current) {
			trailPolylineRef.current = new google.maps.Polyline({
				map,
				path,
				geodesic: true,
				// Dashed via Google's icons-repeat technique: the base line
				// itself is invisible (strokeOpacity: 0) and the repeated
				// short-stroke symbol below draws the visible dashes —
				// distinct on purpose from the solid planned-route line
				// further down, since this is a record of where the
				// technician has actually been, not a suggested route.
				strokeColor: MARKER_COLORS.technician,
				strokeOpacity: 0,
				strokeWeight: 3,
				icons: [
					{
						icon: { path: "M 0,-1 0,1", strokeOpacity: 0.7, scale: 3 },
						offset: "0",
						repeat: "12px",
					},
				],
				zIndex: 1,
			});
		} else {
			trailPolylineRef.current.setPath(path);
		}
	}, [trail]);

	// --- Origin / destination markers + the routed polyline --------------
	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;

		originMarkerRef.current?.setMap(null);
		destinationMarkerRef.current?.setMap(null);
		polylineRef.current?.setMap(null);
		originMarkerRef.current = null;
		destinationMarkerRef.current = null;
		polylineRef.current = null;

		if (origin) {
			originMarkerRef.current = new google.maps.Marker({
				map,
				position: { lat: origin.latitude, lng: origin.longitude },
				title: `Started from: ${origin.label}`,
				icon: coloredDotIcon(MARKER_COLORS.origin),
				zIndex: 1,
			});
		}
		if (destination) {
			destinationMarkerRef.current = new google.maps.Marker({
				map,
				position: { lat: destination.latitude, lng: destination.longitude },
				title: `Next stop: ${destination.label}`,
				icon: coloredDotIcon(MARKER_COLORS.destination),
				zIndex: 2,
			});
		}

		if (!origin || !destination) {
			setRouteSummary(null);
			onRouteComputed?.(null);
			return;
		}

		// Guards against a slower-to-resolve earlier request overwriting a
		// newer one's result — this effect can re-fire in quick succession
		// as origin/destination change (e.g. right after a maintenance
		// report is submitted and the next stop becomes the destination).
		const requestId = ++routeRequestSeq.current;

		async function computeAndDrawRoute(): Promise<void> {
			const { Route } = (await importLibrary(
				"routes"
			)) as google.maps.RoutesLibrary;

			const baseRequest = {
				origin: { lat: origin!.latitude, lng: origin!.longitude },
				destination: { lat: destination!.latitude, lng: destination!.longitude },
				fields: ["path", "distanceMeters", "durationMillis", "localizedValues"],
			};

			let usedFallbackMode = false;
			let routes;
			try {
				({ routes } = await Route.computeRoutes({
					...baseRequest,
					travelMode: "TWO_WHEELER" as google.maps.TravelMode,
				}));
			} catch (err) {
				// TWO_WHEELER coverage varies by region/is in beta — if it's
				// unavailable for this particular origin/destination pair,
				// fall back to a driving route rather than showing nothing,
				// and say so rather than silently mislabeling it.
				console.warn("TWO_WHEELER route failed, falling back to DRIVING:", err);
				usedFallbackMode = true;
				({ routes } = await Route.computeRoutes({
					...baseRequest,
					travelMode: google.maps.TravelMode.DRIVING,
				}));
			}

			if (requestId !== routeRequestSeq.current) return; // superseded

			polylineRef.current?.setMap(null);
			polylineRef.current = null;

			const route = routes?.[0];
			if (!route?.path) {
				setRouteSummary(null);
				onRouteComputed?.(null);
				return;
			}

			polylineRef.current = new google.maps.Polyline({
				map,
				path: route.path,
				strokeColor: "#6366f1",
				strokeOpacity: 0.9,
				strokeWeight: 4,
			});

			const bounds = new google.maps.LatLngBounds();
			route.path.forEach((p) => bounds.extend(p));
			// Non-null assertion, not a new check: `map` was already
			// confirmed non-null at the top of the enclosing effect before
			// this async function was even defined — TypeScript just can't
			// see that guarantee across the closure boundary.
			map!.fitBounds(bounds, 48);

			const summary: RouteSummary = {
				distanceText:
					route.localizedValues?.distance ??
					`${((route.distanceMeters ?? 0) / 1000).toFixed(1)} km`,
				durationText:
					route.localizedValues?.duration ??
					`${Math.round((route.durationMillis ?? 0) / 60000)} min`,
				usedFallbackMode,
			};
			setRouteSummary(summary);
			onRouteComputed?.(summary);
		}

		computeAndDrawRoute().catch((err) => {
			console.error("Route computation failed:", err);
			if (requestId === routeRequestSeq.current) {
				setRouteSummary(null);
				onRouteComputed?.(null);
			}
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [origin?.latitude, origin?.longitude, destination?.latitude, destination?.longitude]);

	if (!apiKey) {
		return (
			<div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted p-6 text-center">
				<AlertTriangle className="h-6 w-6 text-warning" />
				<p className="text-sm font-medium">Google Maps API key not configured</p>
				<p className="max-w-sm text-xs text-muted-foreground">
					Set <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> in the
					environment (with billing enabled and Maps JavaScript API
					turned on for that Google Cloud project) to enable GPS
					Monitoring&apos;s map.
				</p>
			</div>
		);
	}

	if (loadError) {
		return (
			<div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted p-6 text-center">
				<AlertTriangle className="h-6 w-6 text-destructive" />
				<p className="max-w-sm text-sm text-muted-foreground">{loadError}</p>
			</div>
		);
	}

	return (
		<div className="flex h-full w-full flex-col gap-2">
			<div ref={mapDivRef} className="min-h-0 flex-1 rounded-xl" />
			{routeSummary && (
				<div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
					<span className="flex items-center gap-1 font-medium">
						<RouteIcon className="h-4 w-4 text-primary" />
						{routeSummary.distanceText}
					</span>
					<span className="flex items-center gap-1 font-medium">
						<Clock className="h-4 w-4 text-primary" />
						{routeSummary.durationText}
					</span>
					<span className="text-xs text-muted-foreground">
						{routeSummary.usedFallbackMode
							? "Motorcycle routing unavailable here — showing a driving route instead."
							: "Motorcycle route"}
					</span>
				</div>
			)}
			<p className="text-xs text-muted-foreground">
				Walking, bicycling, and two-wheeler routes are in beta and may not
				always reflect the optimal or fully accurate path for a motorcycle.
			</p>
		</div>
	);
}
