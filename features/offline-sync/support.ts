/** Browser capability detection for the offline-first save pipeline. */

export interface SupportReport {
	geolocation: boolean;
	indexedDB: boolean;
	serviceWorker: boolean;
	/** Background Sync is progressive enhancement — its absence does NOT
	 * block saving (we fall back to foreground sync). */
	backgroundSync: boolean;
	permissionsApi: boolean;
}

export function detectSupport(): SupportReport {
	const hasWindow = typeof window !== "undefined";
	return {
		geolocation: hasWindow && "geolocation" in navigator,
		indexedDB: hasWindow && "indexedDB" in window,
		serviceWorker: hasWindow && "serviceWorker" in navigator,
		backgroundSync:
			hasWindow &&
			"serviceWorker" in navigator &&
			"SyncManager" in window,
		permissionsApi: hasWindow && "permissions" in navigator,
	};
}

/** Capabilities without which a report cannot be saved at all. */
export function missingHardRequirements(s: SupportReport): string[] {
	const missing: string[] = [];
	if (!s.geolocation) missing.push("Geolocation (GPS)");
	if (!s.indexedDB) missing.push("Offline storage (IndexedDB)");
	return missing;
}
