// Centralized, environment-driven configuration for the offline-first
// maintenance-report pipeline. All values have production-sensible defaults;
// override via NEXT_PUBLIC_* env vars (inlined at build time).

function num(value: string | undefined, fallback: number): number {
	const n = Number(value);
	return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const OFFLINE_SYNC_CONFIG = {
	/** Reject GPS fixes with horizontal accuracy worse than this (meters). */
	gpsAccuracyThresholdM: num(
		process.env.NEXT_PUBLIC_GPS_ACCURACY_THRESHOLD_M,
		50
	),
	/** Give the device this long to acquire an acceptable fix (ms). */
	gpsAcquisitionTimeoutMs: num(
		process.env.NEXT_PUBLIC_GPS_TIMEOUT_MS,
		30_000
	),
	/** Maximum age of a cached position we will accept (ms). */
	gpsMaximumAgeMs: num(process.env.NEXT_PUBLIC_GPS_MAX_AGE_MS, 15_000),
	/** Exponential backoff schedule between sync retries (ms). After the last
	 * entry the final delay repeats forever — reports are never discarded. */
	retryBackoffMs: [30_000, 60_000, 120_000, 300_000, 600_000],
	/** Attempts after which the UI shows a report as "Failed" (still retried). */
	failedAfterAttempts: 5,
	/** Periodic foreground sync interval while the app is open (ms). */
	foregroundSyncIntervalMs: num(
		process.env.NEXT_PUBLIC_SYNC_INTERVAL_MS,
		60_000
	),
	/** Completed queue entries are pruned after this many days. */
	pruneCompletedAfterDays: 7,
	/** Background Sync registration tag. */
	backgroundSyncTag: "fiix-report-sync",
	/** R2 buckets, matching the server-side allowlist in /api/get-upload-url. */
	buckets: {
		signature: "fiixdrive",
		nozzle: "fiixnozzle",
	},
} as const;
