"use client";

// components/LocationRoutePlanner.tsx
//
// Ad-hoc "how do I get from this client location to that one" planner for
// the Client Locations module. Unlike the Itinerary Order navigate button
// — which is fixed to consecutive stops on a technician's actual day —
// this is free-form: any configured location to any other, for planning
// before a schedule exists.
//
// Both ends come from `locationGeofences`, so only locations with a pin
// already configured can be selected. That's the intended constraint, not
// a limitation: a location with no pin has no coordinates to route to.

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ComboBoxResponsive, ComboboxItem } from "@/components/ui/combobox";
import { Route, ArrowRightLeft, Navigation } from "lucide-react";
import { fetchData } from "@/lib/fetchData";
import { hasCoordinates, openGoogleMapsDirections, type LatLng } from "@/lib/maps";

interface GeofenceRow extends Partial<LatLng> {
	id: number;
	locationId: number;
	locationName: string;
	clientName: string;
}

// Stable reference for the empty case — a fresh `[]` default on every
// render feeds unstable input into the memo below (and is the same trap
// that caused the render loop in ItinerarySequenceManager).
const EMPTY_ROWS: GeofenceRow[] = [];

export function LocationRoutePlanner() {
	const [fromId, setFromId] = useState<string | null>(null);
	const [toId, setToId] = useState<string | null>(null);

	// Shares its query key with the grid below, so the two never disagree
	// and selecting locations costs no extra request once the page is up.
	const { data: rows = EMPTY_ROWS, isLoading } = useQuery<GeofenceRow[]>({
		queryKey: ["/api/admin/master/location-geofences", "route-planner"],
		queryFn: () =>
			fetchData<GeofenceRow[]>("/api/admin/master/location-geofences"),
		staleTime: 1000 * 60 * 5,
	});

	// Only pinned locations are routable, so unpinned rows are filtered out
	// rather than offered and then failing on click.
	const options: ComboboxItem[] = useMemo(
		() =>
			rows
				.filter(hasCoordinates)
				.map((r) => ({
					value: String(r.locationId),
					label: `${r.locationName} (${r.clientName})`,
				})),
		[rows]
	);

	const byLocationId = useMemo(() => {
		const map = new Map<number, GeofenceRow>();
		for (const r of rows) map.set(r.locationId, r);
		return map;
	}, [rows]);

	const from = fromId ? byLocationId.get(Number(fromId)) : undefined;
	const to = toId ? byLocationId.get(Number(toId)) : undefined;
	const sameLocation = !!fromId && fromId === toId;
	const canRoute = hasCoordinates(from) && hasCoordinates(to) && !sameLocation;

	const swap = () => {
		setFromId(toId);
		setToId(fromId);
	};

	const openRoute = () => {
		if (!hasCoordinates(from) || !hasCoordinates(to)) return;
		openGoogleMapsDirections(
			{ latitude: from.latitude, longitude: from.longitude },
			{ latitude: to.latitude, longitude: to.longitude }
		);
	};

	return (
		<Card className="rounded-2xl border shadow-sm">
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base font-semibold">
					<Route className="h-5 w-5 text-primary" />
					Route Planner
				</CardTitle>
				<p className="text-sm text-muted-foreground">
					Pick two client locations to open motorcycle directions between
					them in Google Maps. Only locations with a GPS pin configured
					below can be selected.
				</p>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
					<div className="space-y-1">
						<label className="text-sm font-medium">From</label>
						<ComboBoxResponsive
							data={options}
							placeholder={isLoading ? "Loading…" : "Select start location"}
							selectedValue={fromId}
							onValueChange={setFromId}
							emptyMessage="No pinned location found."
							disabled={isLoading}
						/>
					</div>

					<div className="flex justify-center pb-1">
						<Button
							variant="ghost"
							size="icon"
							className="h-9 w-9"
							onClick={swap}
							disabled={!fromId && !toId}
							aria-label="Swap start and destination"
							title="Swap start and destination"
						>
							<ArrowRightLeft className="h-4 w-4" />
						</Button>
					</div>

					<div className="space-y-1">
						<label className="text-sm font-medium">To</label>
						<ComboBoxResponsive
							data={options}
							placeholder={isLoading ? "Loading…" : "Select destination"}
							selectedValue={toId}
							onValueChange={setToId}
							emptyMessage="No pinned location found."
							disabled={isLoading}
						/>
					</div>
				</div>

				{sameLocation && (
					<p className="text-sm text-warning-foreground">
						Start and destination are the same location.
					</p>
				)}

				<div className="flex justify-end">
					<Button onClick={openRoute} disabled={!canRoute}>
						<Navigation className="h-4 w-4" />
						Open in Google Maps
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
