"use client";

// components/ItinerarySequenceManager.tsx
//
// Lets the Scheduler pick a technician + date and reorder that day's stops.
// Up/down buttons rather than drag-and-drop — there's no drag library
// already in this project, and arrows need zero new dependencies while
// staying just as usable for a handful of stops in one day.
import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ComboBoxResponsive, ComboboxItem } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import {
	ArrowUp,
	ArrowDown,
	ListOrdered,
	Loader2,
	Lock,
	Navigation,
} from "lucide-react";
import { format } from "date-fns";
import { fetchData } from "@/lib/fetchData";
import { apiPath } from "@/lib/base-path";
import { showAppToast } from "@/components/ui/apptoast";
import { useSchedules } from "@/hooks/use-schedules";
import { phTodayDateString } from "@/lib/attendance";
import {
	hasCoordinates,
	openGoogleMapsDirections,
	type LatLng,
} from "@/lib/maps";

interface Technician {
	id: number;
	name: string;
}

interface TechnicianStatus {
	timedInToday: boolean;
}

/** One row of /api/location-coordinates — the geofence pin for a client
 * location. Only ever used to build a Maps link; deliberately never
 * rendered, since raw latitude/longitude is noise to a Scheduler. */
interface LocationCoordinate extends LatLng {
	locationId: number;
}

// Module-level so it's the SAME array reference on every render. The bug
// this fixes: `const { data: schedules = [] } = useSchedules(...)` looks
// harmless, but a `= []` default is a NEW array literal every time `data`
// is undefined (loading, or before a technician/date is picked) — and the
// effect below depends on `schedules` by reference. A fresh reference each
// render means the effect re-fires every render, calls setOrder, triggers a
// re-render, and repeats forever ("Maximum update depth exceeded"). Falling
// back to this shared constant instead keeps the reference stable across
// renders whenever there's genuinely no data, so the effect only fires when
// the schedules actually change.
const EMPTY_SCHEDULES: never[] = [];
// Same stable-reference reasoning as above, for the coordinates query.
const EMPTY_COORDINATES: LocationCoordinate[] = [];

export function ItinerarySequenceManager() {
	const queryClient = useQueryClient();
	const [technicianId, setTechnicianId] = useState<string | null>(null);
	const [date, setDate] = useState<Date | undefined>(new Date());
	const [order, setOrder] = useState<number[] | null>(null);
	const [isSaving, setIsSaving] = useState(false);

	const { data: technicians = [] } = useQuery<Technician[]>({
		queryKey: ["technicians"],
		queryFn: () => fetchData<Technician[]>("/api/technicians"),
		staleTime: 1000 * 60 * 5,
	});
	const technicianOptions: ComboboxItem[] = technicians.map((t) => ({
		value: String(t.id),
		label: t.name,
	}));

	const scheduledAt = date ? format(date, "yyyy-MM-dd") : undefined;
	const { data: schedulesData, isLoading } = useSchedules({
		technicianId: technicianId ? Number(technicianId) : undefined,
		scheduledAt,
	});
	const schedules = schedulesData ?? EMPTY_SCHEDULES;

	// Only meaningful for today — reordering a past or future day is never
	// restricted by whether the technician has timed in (they can't have,
	// for a future day; it's moot for a past one).
	const scheduledAtIsToday = scheduledAt === phTodayDateString();
	const { data: technicianStatus } = useQuery<TechnicianStatus>({
		queryKey: ["technician-status", technicianId],
		queryFn: () =>
			fetchData<TechnicianStatus>(
				`/api/attendance/technician-status?technicianId=${technicianId}`
			),
		enabled: !!technicianId && scheduledAtIsToday,
		// Short — this drives a UI lock the Scheduler needs to see update
		// promptly right around when a technician actually times in.
		staleTime: 30 * 1000,
	});
	const firstStopLocked = scheduledAtIsToday && !!technicianStatus?.timedInToday;

	// Geofence pins for every configured location, fetched once and looked
	// up by locationId. Loaded unconditionally (not per row) because the
	// table is small and one request beats one per stop; a location with no
	// geofence configured simply isn't in the map, which is what disables
	// its navigate button below.
	const { data: coordinates = EMPTY_COORDINATES } = useQuery<
		LocationCoordinate[]
	>({
		queryKey: ["location-coordinates"],
		queryFn: () =>
			fetchData<LocationCoordinate[]>("/api/location-coordinates"),
		staleTime: 1000 * 60 * 10,
	});
	const coordsByLocationId = React.useMemo(() => {
		const map = new Map<number, LatLng>();
		for (const c of coordinates) {
			if (hasCoordinates(c)) {
				map.set(c.locationId, { latitude: c.latitude, longitude: c.longitude });
			}
		}
		return map;
	}, [coordinates]);

	// Local, reorderable copy of the day's schedule ids. Reset whenever the
	// underlying data changes (new technician/date picked, or a save just
	// landed) so a stale local order can never drift from the server.
	useEffect(() => {
		setOrder(schedules.map((s) => s.id));
	}, [schedules]);

	const byId = new Map(schedules.map((s) => [s.id, s]));
	const orderedSchedules = (order ?? [])
		.map((id) => byId.get(id))
		.filter((s): s is (typeof schedules)[number] => !!s);

	const move = (index: number, dir: -1 | 1) => {
		// The first stop (index 0) can't be reordered out of, and nothing can
		// be reordered into it, once the technician has timed in today —
		// enforced here for immediate UI feedback, and again server-side in
		// PATCH /api/schedule/sequence since this is a business rule, not
		// just a UI nicety.
		if (firstStopLocked && (index === 0 || index + dir === 0)) return;
		setOrder((prev) => {
			if (!prev) return prev;
			const next = [...prev];
			const target = index + dir;
			if (target < 0 || target >= next.length) return prev;
			[next[index], next[target]] = [next[target], next[index]];
			return next;
		});
	};

	// Directions from the PREVIOUS stop to this one — the leg the technician
	// is about to ride. That's why the first row never gets this control:
	// there is no preceding stop to route from, and the technician's true
	// starting point (home) isn't something the system knows.
	const navigateFromPrevious = (index: number) => {
		const from = orderedSchedules[index - 1];
		const to = orderedSchedules[index];
		if (!from || !to) return;

		const origin = coordsByLocationId.get(from.locationId);
		const destination = coordsByLocationId.get(to.locationId);
		if (!origin || !destination) return;

		openGoogleMapsDirections(origin, destination);
	};

	const handleSave = async () => {
		if (!technicianId || !scheduledAt || !order || order.length === 0) return;
		setIsSaving(true);
		try {
			const res = await fetch(apiPath("/api/schedule/sequence"), {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					technicianId: Number(technicianId),
					scheduledAt,
					orderedScheduleIds: order,
				}),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error || "Failed to save the new order.");
			}
			showAppToast({
				message: "Itinerary order saved",
				position: "top-right",
				color: "success",
			});
			queryClient.invalidateQueries({ queryKey: ["schedules"] });
		} catch (err) {
			showAppToast({
				message: "Save failed",
				description: err instanceof Error ? err.message : "Please try again.",
				position: "top-right",
				color: "error",
			});
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<Card className="rounded-2xl border shadow-sm">
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base font-semibold">
					<ListOrdered className="h-5 w-5 text-primary" />
					Itinerary Order
				</CardTitle>
				<p className="text-sm text-muted-foreground">
					Set the visit order for a technician&apos;s day. This is what the
					technician sees on their Time In screen and itinerary.
				</p>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div className="space-y-1">
						<label className="text-sm font-medium">Technician</label>
						<ComboBoxResponsive
							data={technicianOptions}
							placeholder="Select technician"
							selectedValue={technicianId}
							onValueChange={setTechnicianId}
							emptyMessage="No technician found."
						/>
					</div>
					<div className="space-y-1">
						<label className="text-sm font-medium">Date</label>
						<DatePicker
							onDateSelect={setDate}
							selectedDate={date}
							allowFutureDates
						/>
					</div>
				</div>

				{firstStopLocked && (
					<div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
						<Lock className="mt-0.5 h-4 w-4 shrink-0" />
						The technician has already timed in. Re-ordering the first
						itinerary is not allowed.
					</div>
				)}

				{!technicianId || !date ? (
					<p className="py-6 text-center text-sm text-muted-foreground">
						Pick a technician and date to see their itinerary.
					</p>
				) : isLoading ? (
					<p className="py-6 text-center text-sm text-muted-foreground">
						Loading…
					</p>
				) : orderedSchedules.length === 0 ? (
					<p className="py-6 text-center text-sm text-muted-foreground">
						No schedules for this technician on this date.
					</p>
				) : (
					<div className="space-y-2">
						{orderedSchedules.map((s, idx) => (
							<div
								key={s.id}
								className="flex items-center gap-3 rounded-xl border p-3"
							>
								<Badge variant="outline" className="w-8 shrink-0 justify-center">
									{idx + 1}
								</Badge>
								<div className="min-w-0 flex-1">
									<p className="truncate font-medium">{s.client?.name}</p>
									<p className="truncate text-xs text-muted-foreground">
										{s.location?.name}
									</p>
								</div>
								<div className="flex shrink-0 gap-1">
									{/* Route from the previous stop to this one. Absent on
									    the first row by design (nothing to route from) and
									    disabled when either end has no geofence pin
									    configured, rather than opening a broken map. */}
									{idx > 0 &&
										(() => {
											const prev = orderedSchedules[idx - 1];
											const hasRoute =
												!!prev &&
												coordsByLocationId.has(prev.locationId) &&
												coordsByLocationId.has(s.locationId);
											return (
												<Button
													variant="outline"
													size="icon"
													className="h-8 w-8"
													disabled={!hasRoute}
													onClick={() => navigateFromPrevious(idx)}
													aria-label={`Directions from ${
														prev?.location?.name ?? "previous stop"
													} to ${s.location?.name ?? "this stop"}`}
													title={
														hasRoute
															? `Directions from ${prev?.location?.name} (motorcycle)`
															: "No GPS pin set for one of these locations — add it under Client Locations."
													}
												>
													<Navigation className="h-4 w-4 text-primary" />
												</Button>
											);
										})()}
									<Button
										variant="outline"
										size="icon"
										className="h-8 w-8"
										disabled={idx === 0 || (firstStopLocked && idx === 1)}
										onClick={() => move(idx, -1)}
										aria-label="Move up"
									>
										<ArrowUp className="h-4 w-4" />
									</Button>
									<Button
										variant="outline"
										size="icon"
										className="h-8 w-8"
										disabled={
											idx === orderedSchedules.length - 1 ||
											(firstStopLocked && idx === 0)
										}
										onClick={() => move(idx, 1)}
										aria-label="Move down"
									>
										<ArrowDown className="h-4 w-4" />
									</Button>
								</div>
							</div>
						))}

						<div className="flex justify-end pt-2">
							{/* Always enabled (aside from the hard preconditions below) —
						    a Scheduler re-clicking Save with no actual change is a
						    deliberate action, not a mistake: it's how they re-notify
						    a technician (see the automatic SMS in the sequence
						    route) without having to touch the order first. */}
						<Button
							onClick={handleSave}
							disabled={isSaving || !order || order.length === 0}
						>
								{isSaving ? (
									<>
										<Loader2 className="h-4 w-4 animate-spin" /> Saving…
									</>
								) : (
									"Save Order"
								)}
							</Button>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
