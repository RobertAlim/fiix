"use client";

// components/GpsMonitoringMap.tsx
//
// Renders via Leaflet + OpenStreetMap tiles — no Google Maps JS API key or
// billing account, consistent with this project's existing approach to
// maps (see lib/maps.ts: the itinerary "Directions" buttons are plain
// keyless Maps URLs for the same reason). This component draws the
// interactive picture (pins + a straight line between them); the actual
// turn-by-turn navigation link below it still hands off to Google Maps.
import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";

export interface MapPoint {
	label: string;
	latitude: number;
	longitude: number;
}

/** Colored dot markers via inline SVG in a divIcon — sidesteps Leaflet's
 * well-known broken-default-marker-image problem under webpack bundling
 * (the plugin's default icon URLs resolve relative to its own package,
 * which breaks silently unless separately worked around) by never
 * referencing an external icon image at all. */
function dotIcon(color: string) {
	return L.divIcon({
		className: "",
		html: `<div style="width:16px;height:16px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,0.25)"></div>`,
		iconSize: [16, 16],
		iconAnchor: [8, 8],
	});
}

const TECHNICIAN_ICON = dotIcon("#4f46e5"); // indigo — matches the app's theme color
const ORIGIN_ICON = dotIcon("#6b7280"); // gray — where the day started / last completed stop
const DESTINATION_ICON = dotIcon("#16a34a"); // green — next assigned itinerary

/** Recenters the map whenever the technician's live position moves,
 * without remounting the whole map (which would reset zoom/pan the
 * Admin may have adjusted). */
function RecenterOnMove({ point }: { point: MapPoint | null }) {
	const map = useMap();
	useEffect(() => {
		if (point) map.setView([point.latitude, point.longitude], map.getZoom());
	}, [point, map]);
	return null;
}

export function GpsMonitoringMap({
	technician,
	origin,
	destination,
}: {
	/** The technician's live position, or null if no fix is available. */
	technician: MapPoint | null;
	origin: MapPoint | null;
	destination: MapPoint | null;
}) {
	const center = technician ?? origin ?? destination ?? {
		// Metro Manila, as a reasonable default when nothing else is known
		// yet (e.g. a technician selected who hasn't sent a ping today).
		latitude: 14.5995,
		longitude: 120.9842,
	};

	return (
		<MapContainer
			center={[center.latitude, center.longitude]}
			zoom={14}
			scrollWheelZoom
			// See app/globals.css for the .fiix-leaflet-map z-index rules this
			// class name activates — belt-and-suspenders alongside the
			// zIndex:0/stacking-context fix below.
			className="fiix-leaflet-map"
			// Leaflet's own CSS gives its zoom controls and panes z-index
			// values up to 1000 — far above the z-50 this app's dropdowns and
			// popovers use. Those values only matter WITHIN a stacking
			// context, so pinning this container's own z-index to 0 here
			// creates a new one: everything inside (controls, tiles, at
			// whatever internal z-index) is now capped at "0" from the
			// outside, and can never paint over page UI again, regardless
			// of what z-index Leaflet assigns internally.
			style={{
				height: "100%",
				width: "100%",
				borderRadius: "0.75rem",
				position: "relative",
				zIndex: 0,
			}}
		>
			<TileLayer
				attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
				url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
			/>

			{origin && destination && (
				<Polyline
					positions={[
						[origin.latitude, origin.longitude],
						[destination.latitude, destination.longitude],
					]}
					pathOptions={{ color: "#6366f1", weight: 3, dashArray: "6 8" }}
				/>
			)}

			{origin && (
				<Marker position={[origin.latitude, origin.longitude]} icon={ORIGIN_ICON}>
					<Popup>Started from: {origin.label}</Popup>
				</Marker>
			)}

			{destination && (
				<Marker
					position={[destination.latitude, destination.longitude]}
					icon={DESTINATION_ICON}
				>
					<Popup>Next stop: {destination.label}</Popup>
				</Marker>
			)}

			{technician && (
				<Marker
					position={[technician.latitude, technician.longitude]}
					icon={TECHNICIAN_ICON}
				>
					<Popup>{technician.label}</Popup>
				</Marker>
			)}

			<RecenterOnMove point={technician} />
		</MapContainer>
	);
}
