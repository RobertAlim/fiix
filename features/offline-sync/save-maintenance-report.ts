// The Save pipeline required by the offline-first spec:
//   support check → permission check → location-services check → GPS capture
//   → (best-effort) reverse geocode → persist locally → queue for sync.
//
// The function returns as soon as the report is safely in IndexedDB — it
// NEVER waits for connectivity, R2 uploads, or the database insert.

import { v4 as uuidv4 } from "uuid";
import type { MaintainFormData } from "@/validation/maintainSchema";
import { detectSupport, missingHardRequirements } from "./support";
import { checkGpsPermission, captureGps } from "./gps";
import { reverseGeocode } from "./geocode";
import { getOfflineDB } from "./local-db";
import { OFFLINE_SYNC_CONFIG } from "./config";
import { audit } from "./audit";
import { requestBackgroundSync, kickForegroundSync } from "./register";
import type { SaveReportResult } from "./types";

export interface SaveReportInput {
	payload: MaintainFormData;
	schedDetailsId: number;
	signatureBlob: Blob | null;
	nozzleBlob: Blob;
	/** Called with progress messages so the UI can narrate the pipeline. */
	onProgress?: (step: string) => void;
}

export async function saveMaintenanceReport(
	input: SaveReportInput
): Promise<SaveReportResult> {
	const { payload, schedDetailsId, signatureBlob, nozzleBlob, onProgress } =
		input;

	// Step 2 — browser support.
	const support = detectSupport();
	const missing = missingHardRequirements(support);
	if (missing.length > 0) {
		return {
			ok: false,
			code: "unsupported-browser",
			message: `This browser is missing required capabilities: ${missing.join(
				", "
			)}. Please use an up-to-date version of Chrome, Edge, or Safari.`,
			detail: missing.join(", "),
		};
	}

	// Step 3 — GPS permission (Permissions API; "prompt" is fine — the
	// capture call itself will raise the browser prompt).
	onProgress?.("Checking location permission…");
	const permission = await checkGpsPermission();
	if (permission === "denied") {
		return {
			ok: false,
			code: "permission-denied",
			message:
				"Location permission is required before submitting a maintenance report.",
		};
	}

	// Steps 4–5 — verify location services and capture a high-accuracy fix.
	// captureGps distinguishes denied / services-off / timeout / poor accuracy.
	onProgress?.("Acquiring GPS position…");
	const gpsResult = await captureGps();
	if (!gpsResult.ok) return gpsResult;
	const gps = gpsResult.fix;

	// Reverse geocode immediately when online; otherwise defer to sync.
	onProgress?.("Resolving location name…");
	const geocode =
		typeof navigator !== "undefined" && navigator.onLine
			? await reverseGeocode(gps.latitude, gps.longitude)
			: null;

	// Persist everything locally in one transaction — offline-first.
	onProgress?.("Saving report on this device…");
	const uuid = uuidv4();
	const signKey = signatureBlob ? `${uuidv4()}.png` : null;
	const nozzleKey = `${uuidv4()}.png`;

	const finalPayload: MaintainFormData = {
		...payload,
		signPath: signKey ?? "Unsigned",
		nozzlePath: nozzleKey,
	};

	try {
		const db = getOfflineDB();
		await db.transaction("rw", db.pendingReports, db.blobs, async () => {
			await db.pendingReports.add({
				uuid,
				payload: finalPayload,
				gps,
				geocode,
				needsGeocode: geocode === null,
				schedDetailsId,
				status: "pending",
				retryCount: 0,
				nextRetryAt: 0,
				lastError: null,
				mtId: null,
				createdAt: Date.now(),
				updatedAt: Date.now(),
				syncedAt: null,
			});
			await db.blobs.add({
				id: uuidv4(),
				reportUuid: uuid,
				kind: "nozzle",
				blob: nozzleBlob,
				contentType: "image/png",
				bucket: OFFLINE_SYNC_CONFIG.buckets.nozzle,
				key: nozzleKey,
				uploaded: 0,
			});
			if (signatureBlob && signKey) {
				await db.blobs.add({
					id: uuidv4(),
					reportUuid: uuid,
					kind: "signature",
					blob: signatureBlob,
					contentType: "image/png",
					bucket: OFFLINE_SYNC_CONFIG.buckets.signature,
					key: signKey,
					uploaded: 0,
				});
			}
		});
	} catch (err) {
		return {
			ok: false,
			code: "storage-error",
			message:
				"Could not save the report on this device. Please free up storage space and try again.",
			detail: err instanceof Error ? err.message : String(err),
		};
	}

	await audit(uuid, "created-offline", navigator.onLine ? "online" : "offline");
	await audit(
		uuid,
		"gps-acquired",
		`lat=${gps.latitude.toFixed(6)} lng=${gps.longitude.toFixed(6)} acc=${Math.round(gps.accuracy)}m`
	);
	if (geocode) await audit(uuid, "reverse-geocoded", geocode.locationName);

	// Queue synchronization: Background Sync where available, plus an
	// immediate foreground kick (fire-and-forget — do not await uploads).
	void requestBackgroundSync();
	void kickForegroundSync();

	return { ok: true, uuid, gps, geocode };
}
