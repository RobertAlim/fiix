"use client";

import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ComboBoxResponsive, ComboboxItem } from "@/components/ui/combobox";
import { Satellite, MapPin, Navigation, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fetchData } from "@/lib/fetchData";
import { openGoogleMapsDirections } from "@/lib/maps";
import { Button } from "@/components/ui/button";

// Leaflet reads `window` at import time, so the map has to be client-only
// and load after mount — a plain top-level import would break the SSR
// pass Next.js does for this page.
// Google Maps' own script touches `window` at load time (same reason the
// earlier Leaflet version needed this), so this stays client-only and
// deferred past the initial render.
const GpsMonitoringMap = dynamic(
	() =>
		import("@/components/GpsMonitoringGoogleMap").then(
			(m) => m.GpsMonitoringGoogleMap
		),
	{ ssr: false, loading: () => <MapLoadingPlaceholder /> }
);

function MapLoadingPlaceholder() {
	return (
		<div className="flex h-full w-full items-center justify-center rounded-xl bg-muted">
			<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
		</div>
	);
}

interface TechnicianGpsRow {
	technicianId: number;
	name: string;
	gpsEnabled: boolean;
	latitude: number | null;
	longitude: number | null;
	accuracy: number | null;
	capturedAt: string | null;
	updatedAt: string | null;
}

interface RoutePlanPoint {
	label: string;
	latitude: number;
	longitude: number;
}
interface RoutePlan {
	status: "not_started" | "no_itinerary" | "in_progress" | "all_completed";
	timedOut?: boolean;
	origin: RoutePlanPoint | null;
	destination: RoutePlanPoint | null;
	stops: {
		scheduleId: number;
		client: string;
		location: string;
		status: "done" | "current" | "upcoming";
	}[];
}

const EMPTY_TECHNICIANS: TechnicianGpsRow[] = [];

const STATUS_LABEL: Record<RoutePlan["status"], string> = {
	not_started: "Hasn't timed in yet today",
	no_itinerary: "No itinerary scheduled today",
	in_progress: "En route",
	all_completed: "All stops completed",
};

export default function GpsMonitoringPage() {
	const [technicianId, setTechnicianId] = useState<string | null>(null);

	// Same list powers the picker AND the live status badge next to it —
	// one query, refetched on the same 15-second cadence GPS Monitoring is
	// documented to update at.
	const { data: technicians = EMPTY_TECHNICIANS, isLoading: isLoadingList } =
		useQuery<TechnicianGpsRow[]>({
			queryKey: ["gps-locations"],
			queryFn: () => fetchData<TechnicianGpsRow[]>("/api/gps/locations"),
			// Matches GpsReporter's 5s ping cadence — anything slower here
			// would mean the device is tracking in near-real-time but the
			// Admin's screen isn't reflecting it that quickly.
			refetchInterval: 5_000,
		});

	const technicianOptions: ComboboxItem[] = useMemo(
		() =>
			technicians.map((t) => ({
				value: String(t.technicianId),
				label: t.name,
			})),
		[technicians]
	);

	const selected = technicians.find(
		(t) => String(t.technicianId) === technicianId
	);

	const { data: routePlan } = useQuery<RoutePlan>({
		queryKey: ["gps-route-plan", technicianId],
		queryFn: () =>
			fetchData<RoutePlan>(`/api/gps/route-plan?technicianId=${technicianId}`),
		enabled: !!technicianId,
		// Slower than the live-position poll above on purpose: the planned
		// route only changes when a maintenance report is completed, not
		// every 5 seconds, so refetching this at the same cadence would just
		// be wasted requests.
		refetchInterval: 15_000,
	});

	const technicianPoint =
		selected?.gpsEnabled && selected.latitude != null && selected.longitude != null
			? { label: selected.name, latitude: selected.latitude, longitude: selected.longitude }
			: null;

	return (
		<div className="space-y-6">
			<Card className="rounded-2xl border shadow-sm">
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base font-semibold">
						<Satellite className="h-5 w-5 text-primary" />
						GPS Monitoring
					</CardTitle>
					<p className="text-sm text-muted-foreground">
						Live technician location, refreshed every 15 seconds. The route
						line shows where today&apos;s itinerary started and the next
						assigned stop — it advances automatically as maintenance reports
						are completed.
					</p>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="max-w-sm space-y-1">
						<label className="text-sm font-medium">Technician</label>
						<ComboBoxResponsive
							data={technicianOptions}
							placeholder={isLoadingList ? "Loading…" : "Select a technician"}
							selectedValue={technicianId}
							onValueChange={setTechnicianId}
							emptyMessage="No technicians found."
						/>
					</div>

					{selected && (
						<div className="flex flex-wrap items-center gap-3 text-sm">
							<Badge
								className={
									selected.gpsEnabled
										? "bg-success text-success-foreground"
										: "bg-destructive text-white"
								}
							>
								GPS {selected.gpsEnabled ? "ON" : "OFF"}
							</Badge>
							{routePlan && (
								<span className="text-muted-foreground">
									{STATUS_LABEL[routePlan.status]}
								</span>
							)}
							{selected.updatedAt && (
								<span className="text-xs text-muted-foreground">
									Last update{" "}
									{formatDistanceToNow(new Date(selected.updatedAt), {
										addSuffix: true,
									})}
								</span>
							)}
						</div>
					)}

					{technicianId ? (
						<div className="relative z-0 h-[480px] w-full overflow-hidden rounded-xl border">
							<GpsMonitoringMap
								technician={technicianPoint}
								origin={routePlan?.origin ?? null}
								destination={routePlan?.destination ?? null}
							/>
						</div>
					) : (
						<div className="flex h-[240px] items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
							<MapPin className="mr-2 h-4 w-4" />
							Select a technician to see their location.
						</div>
					)}

					{routePlan?.origin && routePlan?.destination && (
						<div className="flex justify-end">
							<Button
								variant="outline"
								onClick={() =>
									openGoogleMapsDirections(
										{
											latitude: routePlan.origin!.latitude,
											longitude: routePlan.origin!.longitude,
										},
										{
											latitude: routePlan.destination!.latitude,
											longitude: routePlan.destination!.longitude,
										}
									)
								}
							>
								<Navigation className="h-4 w-4" />
								Open route in Google Maps
							</Button>
						</div>
					)}
				</CardContent>
			</Card>

			{routePlan && routePlan.stops.length > 0 && (
				<Card className="rounded-2xl border shadow-sm">
					<CardHeader>
						<CardTitle className="text-base font-semibold">
							Today&apos;s itinerary
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							{routePlan.stops.map((s, idx) => (
								<div
									key={s.scheduleId}
									className="flex items-center gap-3 rounded-lg border p-3 text-sm"
								>
									<Badge variant="outline" className="w-7 shrink-0 justify-center">
										{idx + 1}
									</Badge>
									<div className="min-w-0 flex-1">
										<p className="truncate font-medium">{s.client}</p>
										<p className="truncate text-xs text-muted-foreground">
											{s.location}
										</p>
									</div>
									<Badge
										className={
											s.status === "done"
												? "bg-success text-success-foreground"
												: s.status === "current"
													? "bg-primary text-primary-foreground"
													: "bg-muted text-muted-foreground"
										}
									>
										{s.status === "done"
											? "Done"
											: s.status === "current"
												? "Next"
												: "Upcoming"}
									</Badge>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
