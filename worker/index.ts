/// <reference lib="webworker" />
// Custom service-worker code, bundled into the generated PWA worker by
// @ducanh2912/next-pwa (customWorkerSrc: "worker"). Runs the SAME sync engine
// the window uses — both operate on the shared IndexedDB queue, and the
// server-side clientUuid idempotency makes window/worker races harmless.
//
// Flow: when a report is saved offline, the page registers a one-shot
// Background Sync ("fiix-report-sync"). The browser fires the `sync` event
// here as soon as connectivity returns — even if the tab was closed — and we
// flush the queue: blobs → R2, report + GPS → Neon.

import { runSyncCycle } from "../features/offline-sync/sync-engine";
import { OFFLINE_SYNC_CONFIG } from "../features/offline-sync/config";

declare const self: ServiceWorkerGlobalScope;

interface SyncEvent extends ExtendableEvent {
	readonly tag: string;
	readonly lastChance: boolean;
}

self.addEventListener("sync", (event) => {
	const syncEvent = event as SyncEvent;
	if (syncEvent.tag !== OFFLINE_SYNC_CONFIG.backgroundSyncTag) return;

	syncEvent.waitUntil(
		runSyncCycle()
			.then(async ({ pending }) => {
				// Anything still pending (e.g. server 5xx mid-flight)? Throwing
				// tells the Sync API to re-fire us later with its own backoff —
				// unless this was the browser's last attempt, in which case the
				// foreground engine takes over next time the app opens.
				await notifyClients();
				if (pending > 0 && !syncEvent.lastChance) {
					throw new Error(`${pending} report(s) still pending`);
				}
			})
			.catch(async (err) => {
				await notifyClients();
				throw err;
			})
	);
});

// Let the page trigger a cycle explicitly (e.g. on "online") without waiting
// for the Sync API, and support browsers where messaging is easier to reach.
self.addEventListener("message", (event) => {
	if (event.data?.type === "fiix-run-sync") {
		event.waitUntil(runSyncCycle().then(notifyClients).catch(() => {}));
	}
});

/** Tell every open tab the queue changed so UI counters refresh instantly
 * (dexie liveQuery already observes IndexedDB, but this closes the gap on
 * browsers without cross-context observability). */
async function notifyClients(): Promise<void> {
	const clients = await self.clients.matchAll({ type: "window" });
	for (const client of clients) {
		client.postMessage({ type: "fiix-sync-updated" });
	}
}
