import Dexie, { type EntityTable } from "dexie";
import type {
	PendingReport,
	PendingBlob,
	AuditEntry,
	MetaEntry,
	RefCacheEntry,
} from "./types";

/**
 * IndexedDB store for offline-first maintenance reports. Runs in both the
 * window and the service worker (Dexie supports both contexts), which is what
 * lets Background Sync process the same queue the UI writes to.
 */
class FiixOfflineDB extends Dexie {
	pendingReports!: EntityTable<PendingReport, "uuid">;
	blobs!: EntityTable<PendingBlob, "id">;
	auditLog!: EntityTable<AuditEntry, "id">;
	meta!: EntityTable<MetaEntry, "key">;
	// Cached reference data (client lists, per-printer lookups, dropdowns) so
	// the Maintenance page can render fully offline instead of hitting the
	// network for things that rarely change. See features/offline-sync/
	// reference-cache.ts for the read/write API.
	refCache!: EntityTable<RefCacheEntry, "key">;

	constructor() {
		super("fiix-offline");
		this.version(1).stores({
			pendingReports: "uuid, status, nextRetryAt, createdAt",
			blobs: "id, reportUuid, uploaded",
			auditLog: "++id, reportUuid, at",
			meta: "key",
		});
		this.version(2).stores({
			pendingReports: "uuid, status, nextRetryAt, createdAt",
			blobs: "id, reportUuid, uploaded",
			auditLog: "++id, reportUuid, at",
			meta: "key",
			refCache: "key, updatedAt",
		});
	}
}

let instance: FiixOfflineDB | null = null;

/** Lazy singleton — never construct at module top level so importing this
 * file during SSR (no indexedDB) stays safe. */
export function getOfflineDB(): FiixOfflineDB {
	if (!instance) instance = new FiixOfflineDB();
	return instance;
}

export const META_KEYS = {
	lastSyncAt: "lastSyncAt",
} as const;
