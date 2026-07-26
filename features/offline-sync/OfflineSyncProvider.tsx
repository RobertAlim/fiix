"use client";

import { useEffect, type ReactNode } from "react";
import { OFFLINE_SYNC_CONFIG } from "./config";
import { kickForegroundSync, requestBackgroundSync } from "./register";

/**
 * Mounts the automatic synchronization triggers for the offline-first
 * pipeline. The technician never presses "Sync":
 *
 *  - `online` event        → immediate cycle + Background Sync registration
 *  - periodic interval     → catches backoff-scheduled retries while open
 *  - tab becomes visible   → catch-up cycle (mobile browsers throttle timers)
 *  - SW "sync-updated" msg → dexie liveQuery refreshes the UI automatically;
 *                            nothing to do, but the listener documents intent
 *
 * The service worker itself (worker/index.ts) covers the app-closed case via
 * the Background Sync API.
 */
export function OfflineSyncProvider({ children }: { children: ReactNode }) {
	useEffect(() => {
		// Initial catch-up: flush anything left over from a previous session.
		kickForegroundSync();
		void requestBackgroundSync();

		const onOnline = () => {
			kickForegroundSync();
			void requestBackgroundSync();
		};
		const onVisible = () => {
			if (document.visibilityState === "visible") kickForegroundSync();
		};

		window.addEventListener("online", onOnline);
		document.addEventListener("visibilitychange", onVisible);
		const interval = window.setInterval(
			kickForegroundSync,
			OFFLINE_SYNC_CONFIG.foregroundSyncIntervalMs
		);

		return () => {
			window.removeEventListener("online", onOnline);
			document.removeEventListener("visibilitychange", onVisible);
			window.clearInterval(interval);
		};
	}, []);

	return <>{children}</>;
}
