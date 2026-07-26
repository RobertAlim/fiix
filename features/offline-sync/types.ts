import type {
	MaintainFormData,
	GpsFix,
	GeocodeResult,
} from "@/validation/maintainSchema";

/** Lifecycle of a locally-saved report as it moves through the sync queue. */
export type SyncStatus =
	| "pending"
	| "waiting-for-connection"
	| "uploading-images"
	| "uploading-signature"
	| "uploading-report"
	| "completed"
	| "failed"
	| "retrying";

export type BlobKind = "signature" | "nozzle";

/** A maintenance report persisted locally (IndexedDB) before it reaches the
 * server. `uuid` is the idempotency key shared with the backend. */
export interface PendingReport {
	uuid: string;
	/** Full validated form payload; signPath/nozzlePath already set to the
	 * final R2 object keys the sync engine will upload to. */
	payload: MaintainFormData;
	gps: GpsFix;
	geocode: GeocodeResult | null;
	/** True when reverse-geocoding still needs to run server-side. */
	needsGeocode: boolean;
	schedDetailsId: number;
	status: SyncStatus;
	retryCount: number;
	/** Epoch ms before which the engine must not retry this report. */
	nextRetryAt: number;
	lastError: string | null;
	/** Server-side maintain.id once known (set after report upload). */
	mtId: number | null;
	createdAt: number;
	updatedAt: number;
	syncedAt: number | null;
}

/** A photo/signature blob awaiting upload to Cloudflare R2. */
export interface PendingBlob {
	id: string;
	reportUuid: string;
	kind: BlobKind;
	blob: Blob;
	contentType: string;
	bucket: string;
	/** Final R2 object key (UUID-based, generated locally). */
	key: string;
	uploaded: 0 | 1;
}

export interface AuditEntry {
	id?: number;
	reportUuid: string;
	event: string;
	detail?: string;
	at: number;
}

export interface MetaEntry {
	key: string;
	value: string | number;
}

/** Typed failure reasons surfaced to the UI by the save pipeline. */
export type SaveFailureCode =
	| "unsupported-browser"
	| "permission-denied"
	| "location-services-off"
	| "gps-timeout"
	| "gps-poor-accuracy"
	| "gps-invalid"
	| "storage-error";

export type SaveReportResult =
	| { ok: true; uuid: string; gps: GpsFix; geocode: GeocodeResult | null }
	| {
			ok: false;
			code: SaveFailureCode;
			message: string;
			/** e.g. best accuracy seen, or the missing browser capability. */
			detail?: string;
	  };
