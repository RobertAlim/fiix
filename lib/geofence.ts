// lib/geofence.ts

/** Great-circle distance between two coordinates, in meters. */
export function distanceMeters(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number
): number {
	const R = 6371000; // Earth radius, meters
	const toRad = (d: number) => (d * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
}

export function isWithinGeofence(
	pointLat: number,
	pointLon: number,
	fenceLat: number,
	fenceLon: number,
	radiusMeters: number
): boolean {
	return distanceMeters(pointLat, pointLon, fenceLat, fenceLon) <= radiusMeters;
}
