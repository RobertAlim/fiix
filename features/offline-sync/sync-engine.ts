// Core synchronization engine. Deliberately free of React/DOM dependencies so
// the exact same code runs in the window (foreground sync) AND inside the
// service worker (Background Sync API) — both operate on the same IndexedDB
// queue, and the idempotency UUID makes concurrent/repeated runs harmless.

import { getOfflineDB, META_KEYS } from "./local-db";
import { OFFLINE_SYNC_CONFIG } from "./config";
import { audit, getAuditTrail } from "./audit";
import type { PendingReport, PendingBlob } from "./types";
import { apiPath } from "@/lib/base-path";

const isOnline = () =>
	typeof navigator === "undefined" || navigator.onLine !== false;

function backoffDelay(retryCount: number): number {
	const schedule = OFFLINE_SYNC_CONFIG.retryBackoffMs;
	return schedule[Math.min(retryCount - 1, schedule.length - 1)];
}

/**
 * fetch() wrapped to give a diagnosable error when the request never
 * completes at all — a bare "Failed to fetch" from the browser can mean
 * offline, DNS failure, or (most commonly for the R2 PUT, which is
 * cross-origin) a CORS policy that doesn't allow this origin. HTTP error
 * statuses (403, 500, ...) are NOT rewritten here — those already produce a
 * real response and are handled by each call site's own `.ok` check.
 */
async function fetchOrExplain(
	url: string,
	init: RequestInit,
	label: string
): Promise<Response> {
	try {
		return await fetch(url, init);
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		throw new Error(
			`Network request failed for ${label}: ${detail}. If this is a cross-origin ` +
				`request (e.g. direct upload to R2), verify the bucket's CORS policy ` +
				`allows this origin; otherwise check connectivity.`
		);
	}
}

async function setStatus(
	uuid: string,
	status: PendingReport["status"],
	extra: Partial<PendingReport> = {}
) {
	await getOfflineDB().pendingReports.update(uuid, {
		status,
		updatedAt: Date.now(),
		...extra,
	});
}

/** Presign-then-PUT one blob to Cloudflare R2, then mark it uploaded. */
async function uploadBlob(entry: PendingBlob): Promise<void> {
	const presignRes = await fetchOrExplain(
		apiPath("/api/get-upload-url"),
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				key: entry.key,
				contentType: entry.contentType,
				bucketName: entry.bucket,
			}),
		},
		"presign request"
	);
	if (!presignRes.ok) {
		throw new Error(`Presign failed (${presignRes.status}) for ${entry.kind}`);
	}
	const { url } = await presignRes.json();

	const putRes = await fetchOrExplain(
		url,
		{
			method: "PUT",
			headers: { "Content-Type": entry.contentType },
			body: entry.blob,
		},
		"R2 upload (cross-origin — check the bucket's CORS policy allows this origin)"
	);
	if (!putRes.ok) {
		throw new Error(`R2 upload failed (${putRes.status}) for ${entry.kind}`);
	}
	await getOfflineDB().blobs.update(entry.id, { uploaded: 1 });
}

/** Sync a single report end-to-end. Throws on any step failure. */
async function syncOne(report: PendingReport): Promise<void> {
	const db = getOfflineDB();
	const blobs = await db.blobs
		.where("reportUuid")
		.equals(report.uuid)
		.toArray();

	// 1. Nozzle-check photo → R2 (skipped automatically on retry if done).
	const nozzle = blobs.find((b) => b.kind === "nozzle" && !b.uploaded);
	if (nozzle) {
		await setStatus(report.uuid, "uploading-images");
		await uploadBlob(nozzle);
		await audit(report.uuid, "photo-uploaded", nozzle.key);
	}

	// 2. Signature → R2.
	const signature = blobs.find((b) => b.kind === "signature" && !b.uploaded);
	if (signature) {
		await setStatus(report.uuid, "uploading-signature");
		await uploadBlob(signature);
		await audit(report.uuid, "signature-uploaded", signature.key);
	}

	// 3. Report + GPS record → Neon. Idempotent: the server keys on
	// clientUuid and returns the existing id on replays.
	let mtId = report.mtId;
	if (!mtId) {
		await setStatus(report.uuid, "uploading-report");
		const trail = (await getAuditTrail(report.uuid)).slice(-100).map((e) => ({
			event: e.event,
			detail: e.detail,
			occurredAt: new Date(e.at).toISOString(),
		}));
		const res = await fetchOrExplain(
			apiPath("/api/maintain"),
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					...report.payload,
					clientUuid: report.uuid,
					gps: report.gps,
					geocode: report.geocode,
					auditTrail: trail,
				}),
			},
			"report upload (same-origin — check server reachability)"
		);
		if (!res.ok) {
			const text = await res.text().catch(() => "");
			throw new Error(`Report upload failed (${res.status}): ${text.slice(0, 300)}`);
		}
		const data = await res.json();
		mtId = data.id as number;
		await setStatus(report.uuid, "uploading-report", { mtId });
		await audit(report.uuid, "maintenance-synced", `mtId=${mtId}`);
	}

	// 4. Link the schedule detail (safe to repeat — it's an idempotent update).
	if (report.schedDetailsId > 0) {
		const schedRes = await fetch(apiPath("/api/sched-details"), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ schedDetailsId: report.schedDetailsId, mtId }),
		});
		if (!schedRes.ok) {
			throw new Error(`Schedule link failed (${schedRes.status})`);
		}
	}

	// 5. Deferred reverse-geocode (when the device was offline at capture).
	if (report.needsGeocode) {
		const geoRes = await fetch(apiPath("/api/maintenance-location/geocode"), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ clientUuid: report.uuid }),
		});
		// A geocode failure must not fail the whole report — the coordinates
		// are already stored. Leave needsGeocode set so a later cycle retries.
		if (geoRes.ok) {
			await getOfflineDB().pendingReports.update(report.uuid, {
				needsGeocode: false,
			});
			await audit(report.uuid, "reverse-geocoded", "resolved-during-sync");
		}
	}

	// 6. Done: free the blobs, keep a completed marker for the UI.
	await db.blobs.where("reportUuid").equals(report.uuid).delete();
	await setStatus(report.uuid, "completed", {
		syncedAt: Date.now(),
		lastError: null,
	});
	await db.meta.put({ key: META_KEYS.lastSyncAt, value: Date.now() });
	await audit(report.uuid, "sync-completed");
}

let cycleRunning = false;

/**
 * Process every due report in the queue. Safe to call from anywhere, any
 * number of times: an in-flight guard prevents overlap within a context, and
 * server-side idempotency protects against cross-context races (window vs SW).
 */
export async function runSyncCycle(): Promise<{ synced: number; pending: number }> {
	if (cycleRunning) return { synced: 0, pending: -1 };
	cycleRunning = true;
	let synced = 0;
	const db = getOfflineDB();

	try {
		// Prune old completed entries.
		const cutoff =
			Date.now() - OFFLINE_SYNC_CONFIG.pruneCompletedAfterDays * 86_400_000;
		await db.pendingReports
			.where("status")
			.equals("completed")
			.filter((r) => (r.syncedAt ?? 0) < cutoff)
			.delete();

		const now = Date.now();
		const due = (
			await db.pendingReports.where("status").notEqual("completed").sortBy("createdAt")
		).filter((r) => r.nextRetryAt <= now);

		for (const report of due) {
			if (!isOnline()) {
				await setStatus(report.uuid, "waiting-for-connection");
				continue;
			}
			try {
				await syncOne(report);
				synced++;
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				const retryCount = report.retryCount + 1;
				const delay = backoffDelay(retryCount);
				const failed =
					retryCount >= OFFLINE_SYNC_CONFIG.failedAfterAttempts;
				await setStatus(report.uuid, failed ? "failed" : "retrying", {
					retryCount,
					nextRetryAt: Date.now() + delay,
					lastError: message,
				});
				await audit(
					report.uuid,
					"retry-attempt",
					`attempt=${retryCount} nextIn=${Math.round(delay / 1000)}s error=${message.slice(0, 200)}`
				);
			}
		}

		const pending = await db.pendingReports
			.where("status")
			.notEqual("completed")
			.count();
		return { synced, pending };
	} finally {
		cycleRunning = false;
	}
}
