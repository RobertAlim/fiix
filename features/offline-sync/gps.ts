import { OFFLINE_SYNC_CONFIG } from "./config";
import type { GpsFix } from "@/validation/maintainSchema";
import type { SaveFailureCode } from "./types";

export type GpsPermissionState = "granted" | "prompt" | "denied" | "unknown";

/** Query the Permissions API for geolocation state (falls back to "unknown"
 * on browsers that don't expose it — Safari < 16, some WebViews). */
export async function checkGpsPermission(): Promise<GpsPermissionState> {
	try {
		if (!("permissions" in navigator)) return "unknown";
		const status = await navigator.permissions.query({
			name: "geolocation",
		});
		return status.state as GpsPermissionState;
	} catch {
		return "unknown";
	}
}

export type GpsCaptureResult =
	| { ok: true; fix: GpsFix }
	| { ok: false; code: SaveFailureCode; message: string; detail?: string };

/**
 * Acquire a high-accuracy GPS fix. Uses watchPosition so the receiver can
 * refine early low-quality fixes; resolves as soon as a fix meets the
 * accuracy threshold, or fails after the acquisition timeout with the best
 * accuracy seen (so the UI can tell the technician how close they were).
 *
 * Also distinguishes "permission denied" from "location services off /
 * position unavailable", which the spec treats as separate user messages.
 */
export function captureGps(): Promise<GpsCaptureResult> {
	const { gpsAccuracyThresholdM, gpsAcquisitionTimeoutMs, gpsMaximumAgeMs } =
		OFFLINE_SYNC_CONFIG;

	return new Promise((resolve) => {
		if (!("geolocation" in navigator)) {
			resolve({
				ok: false,
				code: "unsupported-browser",
				message: "This browser does not support GPS location.",
			});
			return;
		}

		let bestAccuracy = Infinity;
		let settled = false;
		let watchId: number | null = null;

		const finish = (result: GpsCaptureResult) => {
			if (settled) return;
			settled = true;
			if (watchId !== null) navigator.geolocation.clearWatch(watchId);
			clearTimeout(timer);
			resolve(result);
		};

		const timer = setTimeout(() => {
			if (bestAccuracy === Infinity) {
				finish({
					ok: false,
					code: "gps-timeout",
					message:
						"Could not acquire a GPS position. Please move near a window or outdoors and try again.",
				});
			} else {
				finish({
					ok: false,
					code: "gps-poor-accuracy",
					message: `GPS accuracy is too low (best: ${Math.round(
						bestAccuracy
					)}m, required: ≤${gpsAccuracyThresholdM}m). Please move to an area with better GPS reception and try again.`,
					detail: String(Math.round(bestAccuracy)),
				});
			}
		}, gpsAcquisitionTimeoutMs);

		watchId = navigator.geolocation.watchPosition(
			(position) => {
				const c = position.coords;
				if (!Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) {
					return; // keep waiting for a valid fix
				}
				bestAccuracy = Math.min(bestAccuracy, c.accuracy ?? Infinity);
				if ((c.accuracy ?? Infinity) > gpsAccuracyThresholdM) {
					return; // not good enough yet — watchPosition keeps refining
				}
				finish({
					ok: true,
					fix: {
						latitude: c.latitude,
						longitude: c.longitude,
						accuracy: c.accuracy,
						altitude: c.altitude ?? null,
						heading:
							c.heading !== null && Number.isFinite(c.heading)
								? c.heading
								: null,
						speed:
							c.speed !== null && Number.isFinite(c.speed) ? c.speed : null,
						capturedAt: new Date(position.timestamp).toISOString(),
						gpsProvider: "browser-geolocation",
						// Standard browsers do not expose mock-location flags; kept
						// for platforms (e.g. a future WebView bridge) that do.
						isMockLocation: false,
					},
				});
			},
			(err) => {
				if (err.code === err.PERMISSION_DENIED) {
					finish({
						ok: false,
						code: "permission-denied",
						message:
							"Location permission is required before submitting a maintenance report.",
					});
				} else if (err.code === err.POSITION_UNAVAILABLE) {
					finish({
						ok: false,
						code: "location-services-off",
						message:
							"Please enable Location Services before submitting this maintenance report.",
					});
				}
				// TIMEOUT errors: let our own timer produce the message so the
				// best-accuracy hint is included.
			},
			{
				enableHighAccuracy: true,
				timeout: gpsAcquisitionTimeoutMs,
				maximumAge: gpsMaximumAgeMs,
			}
		);
	});
}
