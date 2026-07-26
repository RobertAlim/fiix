"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getOfflineDB, META_KEYS } from "./local-db";
import type { PendingReport } from "./types";

export interface OfflineSyncState {
	/** Reports not yet fully synced. */
	pendingCount: number;
	/** Blobs (photos + signatures) still waiting for R2 upload. */
	queuedUploads: number;
	uploading: boolean;
	failedCount: number;
	lastSyncAt: number | null;
	reports: PendingReport[];
	loaded: boolean;
}

/** Reactive view over the local sync queue (dexie liveQuery — updates in
 * real time as the engine progresses, including from the service worker). */
export function useOfflineSync(): OfflineSyncState {
	const data = useLiveQuery(async () => {
		const db = getOfflineDB();
		const reports = await db.pendingReports
			.orderBy("createdAt")
			.reverse()
			.toArray();
		const queuedUploads = await db.blobs.where("uploaded").equals(0).count();
		const lastSync = await db.meta.get(META_KEYS.lastSyncAt);
		return { reports, queuedUploads, lastSyncAt: (lastSync?.value as number) ?? null };
	}, []);

	const reports = data?.reports ?? [];
	const active = reports.filter((r) => r.status !== "completed");

	return {
		pendingCount: active.length,
		queuedUploads: data?.queuedUploads ?? 0,
		uploading: active.some((r) => r.status.startsWith("uploading")),
		failedCount: active.filter((r) => r.status === "failed").length,
		lastSyncAt: data?.lastSyncAt ?? null,
		reports,
		loaded: data !== undefined,
	};
}
