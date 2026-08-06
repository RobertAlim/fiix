"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
	CloudOff,
	CloudUpload,
	Clock3,
	MapPin,
	Wifi,
	FileClock,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
	useOfflineSync,
	useConnectivity,
	checkGpsPermission,
} from "@/features/offline-sync";
import { cn } from "@/lib/utils";
import { TechnicianGpsStatusPanel } from "@/components/TechnicianGpsStatusPanel";

/**
 * Dashboard widget row for the offline-first pipeline: pending reports,
 * last sync, offline mode, queued uploads, and GPS status — so technicians
 * and admins can see queue health at a glance.
 */
export function OfflineSyncWidgets({
	// The "Offline Mode" card below reports THIS device's own network
	// state, which is meaningful for a Technician (it explains why their
	// reports might be queued) but not for an Admin/Scheduler watching the
	// fleet from a desk — they instead get the Technician GPS Status panel
	// in that slot. Technicians keep seeing their own Offline Mode card
	// unchanged.
	showFleetGpsStatus = false,
}: {
	showFleetGpsStatus?: boolean;
}) {
	const sync = useOfflineSync();
	const { online, effectiveType } = useConnectivity();
	const [gpsPermission, setGpsPermission] = useState<string>("checking…");

	useEffect(() => {
		let mounted = true;
		checkGpsPermission().then((state) => {
			if (mounted) setGpsPermission(state);
		});
		return () => {
			mounted = false;
		};
	}, []);

	if (!sync.loaded) return null;

	if (showFleetGpsStatus) {
		return (
			<div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
				<TechnicianGpsStatusPanel />
			</div>
		);
	}

	const lastReportWithGps = sync.reports.find((r) => r.gps);
	const gpsDetail =
		gpsPermission === "granted"
			? lastReportWithGps
				? `Accuracy ±${Math.round(lastReportWithGps.gps.accuracy)}m`
				: "Ready"
			: gpsPermission === "denied"
			? "Permission denied"
			: gpsPermission === "prompt"
			? "Will ask on save"
			: "Unknown";

	const widgets = [
		{
			label: "Pending Reports",
			value:
				sync.pendingCount > 0 ? `${sync.pendingCount} Waiting` : "None",
			detail:
				sync.failedCount > 0
					? `${sync.failedCount} failed — retrying automatically`
					: "All reports reach the server automatically",
			icon: FileClock,
			accent:
				sync.failedCount > 0
					? "text-red-500"
					: sync.pendingCount > 0
					? "text-yellow-500"
					: "text-green-500",
		},
		{
			label: "Last Sync",
			value: sync.lastSyncAt
				? formatDistanceToNow(sync.lastSyncAt, { addSuffix: true })
				: "—",
			detail: "Most recent successful upload",
			icon: Clock3,
			accent: "text-primary",
		},
		{
			label: "Offline Mode",
			value: online ? "Standby" : "Active",
			detail: online
				? effectiveType
					? `Online (${effectiveType})`
					: "Online"
				: "Reports save locally and sync later",
			icon: online ? Wifi : CloudOff,
			accent: online ? "text-green-500" : "text-yellow-500",
		},
		{
			label: "Queued Uploads",
			value: String(sync.queuedUploads),
			detail: "Photos & signatures awaiting upload",
			icon: CloudUpload,
			accent:
				sync.queuedUploads > 0 ? "text-blue-500" : "text-muted-foreground",
		},
		{
			label: "GPS Status",
			value:
				gpsPermission === "granted"
					? "Connected"
					: gpsPermission.charAt(0).toUpperCase() + gpsPermission.slice(1),
			detail: gpsDetail,
			icon: MapPin,
			accent:
				gpsPermission === "granted"
					? "text-green-500"
					: gpsPermission === "denied"
					? "text-red-500"
					: "text-muted-foreground",
		},
	];

	return (
		<div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
			{widgets.map(({ label, value, detail, icon: Icon, accent }) => (
				<Card key={label} className="border">
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<p className="text-xs font-medium text-muted-foreground">
								{label}
							</p>
							<Icon className={cn("h-4 w-4", accent)} />
						</div>
						<p className="mt-1 truncate text-lg font-semibold">{value}</p>
						<p className="mt-0.5 truncate text-[11px] text-muted-foreground">
							{detail}
						</p>
					</CardContent>
				</Card>
			))}
		</div>
	);
}
