import { getOfflineDB } from "./local-db";

/**
 * Append an event to the local audit trail for a report. Events are also
 * shipped to the server (maintenance_sync_events) when the report syncs, so
 * the full offline history survives even after local cleanup.
 *
 * Standard events: created-offline, gps-acquired, reverse-geocoded,
 * photo-uploaded, signature-uploaded, maintenance-synced, retry-attempt,
 * sync-completed, sync-error.
 */
export async function audit(
	reportUuid: string,
	event: string,
	detail?: string
): Promise<void> {
	try {
		await getOfflineDB().auditLog.add({
			reportUuid,
			event,
			detail,
			at: Date.now(),
		});
	} catch {
		// The audit trail must never break the pipeline itself.
	}
}

export async function getAuditTrail(reportUuid: string) {
	return getOfflineDB()
		.auditLog.where("reportUuid")
		.equals(reportUuid)
		.sortBy("at");
}
