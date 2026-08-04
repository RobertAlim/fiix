"use client";

// components/TimeInScreen.tsx
//
// Wraps the Technician's dashboard content. Renders the gate (Time In
// screen, or an end-of-day screen) instead of `children` until today's
// attendance session says otherwise.
//
// Deliberately fails CLOSED on a network error rather than letting the
// technician through: the whole point of this gate is a server-verified
// geofence check, so an unreachable /api/attendance/status is treated as
// "not yet timed in," not "assume it's fine." This is a real tension with
// the rest of the app's offline-first design (maintenance reports queue and
// sync later) — Time In itself has no offline story, since the geofence
// check has to happen against a live server. A technician who starts their
// day somewhere without signal will need to wait for it before the gate
// opens, same as they already do for the GPS fix maintenance reports require.
import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
	MapPin,
	Loader2,
	AlertTriangle,
	CheckCircle2,
	WifiOff,
	Clock3,
	CalendarCheck2,
} from "lucide-react";
import { fetchData } from "@/lib/fetchData";
import { apiPath } from "@/lib/base-path";
import { distanceMeters } from "@/lib/geofence";
import { showAppToast } from "@/components/ui/apptoast";

interface ItineraryStop {
	id: number;
	client: string;
	location: string;
	sequence: number | null;
	notes: string | null;
}

interface AttendanceStatus {
	session: { id: number; timeIn: string; timeOut: string | null } | null;
	itinerary: ItineraryStop[];
	firstStop: ItineraryStop | null;
	geofence: { latitude: number; longitude: number; radiusMeters: number } | null;
}

export function AttendanceGate({
	isTechnician,
	children,
}: {
	isTechnician: boolean;
	children: React.ReactNode;
}) {
	const {
		data: status,
		isLoading,
		isError,
		refetch,
	} = useQuery<AttendanceStatus>({
		queryKey: ["attendance-status"],
		queryFn: () => fetchData<AttendanceStatus>("/api/attendance/status"),
		enabled: isTechnician,
		staleTime: 0,
	});

	if (!isTechnician) return <>{children}</>;

	if (isLoading) {
		return (
			<div className="flex min-h-[60vh] items-center justify-center">
				<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (isError || !status) {
		return (
			<div className="flex min-h-[60vh] items-center justify-center p-4">
				<Card className="w-full max-w-md rounded-2xl border shadow-sm">
					<CardContent className="flex flex-col items-center gap-3 p-8 text-center">
						<WifiOff className="h-8 w-8 text-muted-foreground" />
						<p className="font-medium">Can&apos;t reach the server</p>
						<p className="text-sm text-muted-foreground">
							Time In needs a connection to verify your location. Check your
							signal and try again.
						</p>
						<Button onClick={() => refetch()}>Retry</Button>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (status.session && !status.session.timeOut) {
		return <>{children}</>;
	}

	if (status.session && status.session.timeOut) {
		return <ShiftCompleteScreen timeOut={status.session.timeOut} />;
	}

	return <TimeInGate status={status} />;
}

function ShiftCompleteScreen({ timeOut }: { timeOut: string }) {
	const timeStr = new Date(timeOut).toLocaleTimeString("en-US", {
		timeZone: "Asia/Manila",
		hour: "2-digit",
		minute: "2-digit",
	});
	return (
		<div className="flex min-h-[60vh] items-center justify-center p-4">
			<Card className="w-full max-w-md rounded-2xl border shadow-sm">
				<CardContent className="flex flex-col items-center gap-3 p-8 text-center">
					<CalendarCheck2 className="h-8 w-8 text-success" />
					<p className="font-medium">Shift complete</p>
					<p className="text-sm text-muted-foreground">
						You timed out at {timeStr}. See you on your next scheduled day.
					</p>
				</CardContent>
			</Card>
		</div>
	);
}

function TimeInGate({ status }: { status: AttendanceStatus }) {
	const queryClient = useQueryClient();
	const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
	const [gpsError, setGpsError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Live-watches position (rather than a one-shot fix) so the button's
	// enabled state tracks the technician actually walking into range,
	// instead of requiring a manual "check again" tap.
	useEffect(() => {
		if (!("geolocation" in navigator)) {
			setGpsError("This browser does not support GPS location.");
			return;
		}
		const watchId = navigator.geolocation.watchPosition(
			(position) => {
				setGpsError(null);
				setCoords({
					lat: position.coords.latitude,
					lng: position.coords.longitude,
				});
			},
			(err) => {
				setGpsError(
					err.code === err.PERMISSION_DENIED
						? "Location permission is required to time in."
						: "Could not get your location. Enable Location Services and try again."
				);
			},
			{ enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
		);
		return () => navigator.geolocation.clearWatch(watchId);
	}, []);

	const distance = useMemo(() => {
		if (!coords || !status.geofence) return null;
		return distanceMeters(
			coords.lat,
			coords.lng,
			status.geofence.latitude,
			status.geofence.longitude
		);
	}, [coords, status.geofence]);

	const withinGeofence =
		distance != null && status.geofence != null && distance <= status.geofence.radiusMeters;

	const canTimeIn =
		!!status.firstStop && !!status.geofence && withinGeofence && !isSubmitting;

	const handleTimeIn = async () => {
		if (!coords) return;
		setIsSubmitting(true);
		try {
			const res = await fetch(apiPath("/api/attendance/time-in"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ latitude: coords.lat, longitude: coords.lng }),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error || "Failed to time in.");
			}
			showAppToast({
				message: "Timed in",
				description: "Have a good shift.",
				position: "top-right",
				color: "success",
			});
			queryClient.invalidateQueries({ queryKey: ["attendance-status"] });
		} catch (err) {
			showAppToast({
				message: "Time In failed",
				description: err instanceof Error ? err.message : "Please try again.",
				position: "top-right",
				color: "error",
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 py-8">
			<Card className="rounded-2xl border shadow-sm">
				<CardContent className="flex flex-col items-center gap-4 p-8 text-center">
					<div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
						<MapPin className="h-7 w-7 text-primary" />
					</div>
					<div>
						<p className="text-lg font-semibold">Time In</p>
						<p className="text-sm text-muted-foreground">
							{status.firstStop
								? `Get within range of ${status.firstStop.client} to start your shift.`
								: "You have no scheduled visits today — contact your Scheduler."}
						</p>
					</div>

					{gpsError && (
						<p className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
							<AlertTriangle className="h-4 w-4 shrink-0" />
							{gpsError}
						</p>
					)}

					{status.firstStop && !status.geofence && (
						<p className="flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
							<AlertTriangle className="h-4 w-4 shrink-0" />
							No geofence is configured for this location yet. Ask an admin to
							set one up in Client Locations.
						</p>
					)}

					{status.firstStop && status.geofence && !gpsError && (
						<Badge
							variant={withinGeofence ? "default" : "destructive"}
							className="gap-1"
						>
							{withinGeofence ? (
								<CheckCircle2 className="h-3.5 w-3.5" />
							) : (
								<Clock3 className="h-3.5 w-3.5" />
							)}
							{coords == null
								? "Getting your location…"
								: withinGeofence
								? "You're within range"
								: distance != null
								? `${Math.round(distance)}m away — move closer`
								: "Checking distance…"}
						</Badge>
					)}

					<Button size="lg" className="w-full" disabled={!canTimeIn} onClick={handleTimeIn}>
						{isSubmitting ? (
							<>
								<Loader2 className="h-4 w-4 animate-spin" /> Timing in…
							</>
						) : (
							"Time In"
						)}
					</Button>
				</CardContent>
			</Card>

			{status.itinerary.length > 0 && (
				<div className="space-y-3">
					<p className="text-sm font-medium text-muted-foreground">
						Today&apos;s itinerary
					</p>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						{status.itinerary.map((stop, idx) => (
							<Card key={stop.id} className="rounded-xl border shadow-none">
								<CardContent className="flex items-start gap-3 p-4">
									<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
										{stop.sequence ?? idx + 1}
									</div>
									<div className="min-w-0">
										<p className="truncate font-medium">{stop.client}</p>
										<p className="truncate text-xs text-muted-foreground">
											{stop.location}
										</p>
										{stop.notes && (
											<p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
												{stop.notes}
											</p>
										)}
									</div>
								</CardContent>
							</Card>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
