// Window-side wiring: Background Sync registration and foreground sync kicks.

import { OFFLINE_SYNC_CONFIG } from "./config";
import { runSyncCycle } from "./sync-engine";

/** Register a one-shot Background Sync so the browser wakes the service
 * worker to flush the queue even if the tab is closed before connectivity
 * returns. No-op on browsers without the Sync API (foreground sync covers
 * them whenever the app is open). */
export async function requestBackgroundSync(): Promise<boolean> {
	try {
		if (
			typeof window === "undefined" ||
			!("serviceWorker" in navigator) ||
			!("SyncManager" in window)
		) {
			return false;
		}
		const registration = await navigator.serviceWorker.ready;
		// sync is typed lazily because lib.dom omits it on some TS targets.
		const sync = (
			registration as ServiceWorkerRegistration & {
				sync?: { register(tag: string): Promise<void> };
			}
		).sync;
		if (!sync) return false;
		await sync.register(OFFLINE_SYNC_CONFIG.backgroundSyncTag);
		return true;
	} catch {
		return false;
	}
}

/** Run a sync cycle in the window without blocking the caller. */
export function kickForegroundSync(): void {
	if (typeof window === "undefined") return;
	void runSyncCycle().catch(() => {
		// Errors are recorded per-report inside the engine.
	});
}
