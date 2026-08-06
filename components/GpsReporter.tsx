"use client";

// components/GpsReporter.tsx
//
// Mounted inside AttendanceGate for the duration a Technician is clocked
// in (see the "on duty" branch there) — invisible, renders nothing. Watches
// position continuously and POSTs a ping to /api/gps/ping roughly every 15
// seconds, which is what powers GPS Monitoring, the Dashboard's Technician
// GPS Status panel, and the off-duty-GPS SMS alert.
//
// Deliberately separate from the maintenance-report GPS capture in
// features/offline-sync — that one is a single fix taken at save time and
// must work offline (queued like everything else in that pipeline). This
// one is a live, online-only heartbeat with an entirely different
// lifetime (the whole shift, not one report) and purpose (where is this
// person right now, for someone else to see), so folding it into the
// offline-sync queue would mean forcing a "GPS off" event through a retry
// queue meant for maintenance data — the wrong contract for a status
// signal that's only useful in near-real-time anyway.
import { useEffect, useRef } from "react";
import { apiPath } from "@/lib/base-path";

const PING_INTERVAL_MS = 5_000;

async function sendPing(body: object) {
	try {
		await fetch(apiPath("/api/gps/ping"), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
			// A dropped ping isn't worth retrying — another one is 15s away
			// regardless, and retrying a stale fix would misreport position.
			keepalive: true,
		});
	} catch {
		// Silent by design: this is a background heartbeat the technician
		// never sees and must never interrupt their actual work.
	}
}

export function GpsReporter({ active }: { active: boolean }) {
	// Throttles watchPosition's callback (which can fire far more often
	// than every 15s) down to the interval GPS Monitoring is documented to
	// refresh at, without tearing down and restarting the watch itself.
	const lastSentAt = useRef(0);
	const offSentRef = useRef(false);

	useEffect(() => {
		if (!active || typeof navigator === "undefined" || !navigator.geolocation) {
			return;
		}

		lastSentAt.current = 0;
		offSentRef.current = false;

		const watchId = navigator.geolocation.watchPosition(
			(position) => {
				offSentRef.current = false;
				const now = Date.now();
				if (now - lastSentAt.current < PING_INTERVAL_MS) return;
				lastSentAt.current = now;
				sendPing({
					latitude: position.coords.latitude,
					longitude: position.coords.longitude,
					accuracy: position.coords.accuracy,
				});
			},
			() => {
				// Location services off, permission revoked mid-shift, etc.
				// Sent once per off episode (not on every error callback,
				// which can fire repeatedly) — the server independently
				// dedupes this too, but there's no reason to spam the
				// network with pings the server will just discard as
				// duplicates.
				if (offSentRef.current) return;
				offSentRef.current = true;
				sendPing({ enabled: false });
			},
			// maximumAge is kept just under PING_INTERVAL_MS so each 5s ping
			// carries a fix from THIS cycle, not one recycled from the last —
			// at the old 15s cadence a 10s cache was fine; at 5s it would
			// have let the browser reuse the same position across 2+ pings.
			{ enableHighAccuracy: false, maximumAge: 4_000, timeout: 20_000 }
		);

		return () => navigator.geolocation.clearWatch(watchId);
	}, [active]);

	return null;
}
