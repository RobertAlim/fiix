"use client";

// components/TechnicianGpsStatusPanel.tsx
//
// Replaces the single "Offline Mode" card (from OfflineSyncWidgets) on the
// Dashboard for Admin/Scheduler viewers — that card reports the VIEWER's
// own device network state, which means nothing to an Admin who isn't out
// in the field; what they actually want to see there is whether each
// Technician's GPS is currently on. Left untouched for Technicians
// themselves, who still see their own Offline Mode card (see Dashboard.tsx).
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Satellite, SatelliteDish } from "lucide-react";
import { fetchData } from "@/lib/fetchData";
import { cn } from "@/lib/utils";

interface TechnicianGpsRow {
	technicianId: number;
	name: string;
	gpsEnabled: boolean;
}

const EMPTY_TECHNICIANS: TechnicianGpsRow[] = [];

export function TechnicianGpsStatusPanel() {
	const { data: technicians = EMPTY_TECHNICIANS, isLoading } = useQuery<
		TechnicianGpsRow[]
	>({
		queryKey: ["gps-locations"],
		queryFn: () => fetchData<TechnicianGpsRow[]>("/api/gps/locations"),
		// Same cadence GPS Monitoring itself refreshes at, so this panel and
		// that page never show contradicting statuses for more than a beat.
		refetchInterval: 15_000,
	});

	if (isLoading) return null;

	return (
		<Card className="border">
			<CardContent className="p-4">
				<div className="flex items-center justify-between">
					<p className="text-xs font-medium text-muted-foreground">
						Technician GPS Status
					</p>
					<Satellite className="h-4 w-4 text-primary" />
				</div>
				{technicians.length === 0 ? (
					<p className="mt-2 text-sm text-muted-foreground">
						No technicians yet.
					</p>
				) : (
					<div className="mt-2 space-y-1.5">
						{technicians.map((t) => (
							<div
								key={t.technicianId}
								className="flex items-center justify-between gap-2 text-sm"
							>
								<span className="truncate">{t.name}</span>
								<span
									className={cn(
										"flex items-center gap-1 text-xs font-semibold",
										t.gpsEnabled ? "text-success" : "text-destructive"
									)}
								>
									<SatelliteDish className="h-3 w-3" />
									{t.gpsEnabled ? "ON" : "OFF"}
								</span>
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
