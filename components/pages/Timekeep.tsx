"use client";

// components/pages/Timekeep.tsx
//
// The Admin/Scheduler counterpart to the Technician's Time In gate
// (components/TimeInScreen.tsx). Deliberately a much simpler screen — no
// itinerary, no offline-first considerations (office staff don't file
// field maintenance reports) — but the same live-GPS-vs-geofence pattern,
// reading from staffGpsLocations (configured by a Super Admin under Staff
// GPS Location) instead of a schedule's client location.
import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	MapPin,
	Loader2,
	AlertTriangle,
	CheckCircle2,
	Clock3,
	LogIn,
	LogOut,
	Timer,
} from "lucide-react";
import { fetchData } from "@/lib/fetchData";
import { apiPath } from "@/lib/base-path";
import { distanceMeters } from "@/lib/geofence";
import { showAppToast } from "@/components/ui/apptoast";

interface StaffAttendanceStatus {
	session: { id: number; timeIn: string; timeOut: string | null } | null;
	geofence: {
		label: string;
		latitude: number;
		longitude: number;
		radiusMeters: number;
	} | null;
}

export default function TimekeepPage() {
	const queryClient = useQueryClient();
	const {
		data: status,
		isLoading,
		isError,
		refetch,
	} = useQuery<StaffAttendanceStatus>({
		queryKey: ["staff-attendance-status"],
		queryFn: () => fetchData<StaffAttendanceStatus>("/api/attendance/staff/status"),
		staleTime: 0,
		refetchInterval: 5 * 60 * 1000,
	});

	const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
	const [gpsError, setGpsError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	useEffect(() => {
		if (!("geolocation" in navigator)) {
			setGpsError("This browser does not support GPS location.");
			return;
		}
		const watchId = navigator.geolocation.watchPosition(
			(position) => {
				setGpsError(null);
				setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
			},
			(err) => {
				setGpsError(
					err.code === err.PERMISSION_DENIED
						? "Location permission is required to time in or out."
						: "Could not get your location. Enable Location Services and try again."
				);
			},
			{ enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
		);
		return () => navigator.geolocation.clearWatch(watchId);
	}, []);

	const distance = useMemo(() => {
		if (!coords || !status?.geofence) return null;
		return distanceMeters(
			coords.lat,
			coords.lng,
			status.geofence.latitude,
			status.geofence.longitude
		);
	}, [coords, status?.geofence]);

	const withinGeofence =
		distance != null && status?.geofence != null && distance <= status.geofence.radiusMeters;

	const isTimedIn = !!status?.session && !status.session.timeOut;
	const canAct = !!status?.geofence && withinGeofence && !isSubmitting && !!coords;

	const handleAction = async () => {
		if (!coords) return;
		setIsSubmitting(true);
		const endpoint = isTimedIn
			? "/api/attendance/staff/time-out"
			: "/api/attendance/staff/time-in";
		try {
			const res = await fetch(apiPath(endpoint), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ latitude: coords.lat, longitude: coords.lng }),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(
					data.error || `Failed to ${isTimedIn ? "time out" : "time in"}.`
				);
			}
			showAppToast({
				message: isTimedIn ? "Timed out" : "Timed in",
				position: "top-right",
				color: "success",
			});
			queryClient.invalidateQueries({ queryKey: ["staff-attendance-status"] });
		} catch (err) {
			showAppToast({
				message: isTimedIn ? "Time Out failed" : "Time In failed",
				description: err instanceof Error ? err.message : "Please try again.",
				position: "top-right",
				color: "error",
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	if (isLoading) {
		return (
			<div className="flex min-h-[40vh] items-center justify-center">
				<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (isError || !status) {
		return (
			<Card className="mx-auto max-w-md rounded-2xl border shadow-sm">
				<CardContent className="flex flex-col items-center gap-3 p-8 text-center">
					<AlertTriangle className="h-8 w-8 text-muted-foreground" />
					<p className="font-medium">Can&apos;t reach the server</p>
					<Button onClick={() => refetch()}>Retry</Button>
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<Card className="rounded-2xl border shadow-sm">
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base font-semibold">
						<Timer className="h-5 w-5 text-primary" />
						Timekeep
					</CardTitle>
					<p className="text-sm text-muted-foreground">
						Time in and out from within range of your assigned GPS location.
						Your records appear in Attendance Report alongside technician
						attendance.
					</p>
				</CardHeader>
				<CardContent className="flex flex-col items-center gap-4 py-8 text-center">
					<div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
						<MapPin className="h-7 w-7 text-primary" />
					</div>

					{status.session?.timeIn && (
						<div className="flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
							<Clock3 className="h-4 w-4" />
							Timed in at{" "}
							{new Date(status.session.timeIn).toLocaleTimeString("en-US", {
								timeZone: "Asia/Manila",
								hour: "2-digit",
								minute: "2-digit",
							})}
							{status.session.timeOut && (
								<>
									{" · Timed out at "}
									{new Date(status.session.timeOut).toLocaleTimeString("en-US", {
										timeZone: "Asia/Manila",
										hour: "2-digit",
										minute: "2-digit",
									})}
								</>
							)}
						</div>
					)}

					{status.session?.timeOut ? (
						<p className="text-sm text-muted-foreground">
							Shift complete for today. See you next scheduled day.
						</p>
					) : (
						<>
							{!status.geofence ? (
								<p className="flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
									<AlertTriangle className="h-4 w-4 shrink-0" />
									No GPS location has been configured for your account yet.
									Ask a Super Admin to set one up under Staff GPS Location.
								</p>
							) : (
								<p className="text-sm text-muted-foreground">
									{isTimedIn
										? `Get within range of ${status.geofence.label} to time out.`
										: `Get within range of ${status.geofence.label} to time in.`}
								</p>
							)}

							{gpsError && (
								<p className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
									<AlertTriangle className="h-4 w-4 shrink-0" />
									{gpsError}
								</p>
							)}

							{status.geofence && !gpsError && (
								<Badge variant={withinGeofence ? "default" : "destructive"} className="gap-1">
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

							<Button size="lg" className="w-full gap-2" disabled={!canAct} onClick={handleAction}>
								{isSubmitting ? (
									<>
										<Loader2 className="h-4 w-4 animate-spin" />{" "}
										{isTimedIn ? "Timing out…" : "Timing in…"}
									</>
								) : isTimedIn ? (
									<>
										<LogOut className="h-4 w-4" /> Time Out
									</>
								) : (
									<>
										<LogIn className="h-4 w-4" /> Time In
									</>
								)}
							</Button>
						</>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
