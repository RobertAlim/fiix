"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MasterDataManager } from "@/components/MasterDataManager";
import { MapPin } from "lucide-react";
import { LocationRoutePlanner } from "@/components/LocationRoutePlanner";

export default function LocationGeofencesPage() {
	return (
		<div className="space-y-6">
			<LocationRoutePlanner />

			<Card className="rounded-2xl border shadow-sm">
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base font-semibold">
					<MapPin className="h-5 w-5 text-primary" />
					Client Locations
				</CardTitle>
				<p className="text-sm text-muted-foreground">
					GPS pin and allowed radius for each client location. A
					Technician can only Time In once they&apos;re inside this radius
					of their first scheduled stop for the day.
				</p>
			</CardHeader>
			<CardContent>
				<MasterDataManager
					title="Geofence"
					listEndpoint="/api/admin/master/location-geofences"
					itemEndpoint={(id) => `/api/admin/master/location-geofences/${id}`}
					filters={[{ param: "search", label: "Location" }]}
					columns={[
						{ key: "clientName", label: "Client", minWidth: "min-w-[160px]" },
						{ key: "locationName", label: "Location", minWidth: "min-w-[160px]" },
						{
							key: "latitude",
							label: "Latitude",
							minWidth: "min-w-[110px]",
							render: (r) => Number(r.latitude).toFixed(6),
						},
						{
							key: "longitude",
							label: "Longitude",
							minWidth: "min-w-[110px]",
							render: (r) => Number(r.longitude).toFixed(6),
						},
						{
							key: "radiusMeters",
							label: "Radius",
							minWidth: "min-w-[100px]",
							render: (r) => `${r.radiusMeters}m`,
						},
					]}
					fields={[
						{
							name: "locationId",
							label: "Location",
							type: "select",
							required: true,
							immutable: true,
							optionsEndpoint: "/api/admin/master/locations",
							optionsQueryKey: ["/api/admin/master/locations"],
							optionsMap: (r) => ({
								value: String(r.id),
								label: `${r.name} (${r.clientName})`,
							}),
						},
						{
							name: "latitude",
							label: "Latitude",
							type: "number",
							required: true,
							placeholder: "e.g. 14.418812",
						},
						{
							name: "longitude",
							label: "Longitude",
							type: "number",
							required: true,
							placeholder: "e.g. 121.043614",
						},
						{
							name: "radiusMeters",
							label: "Radius (meters)",
							type: "number",
							required: true,
							placeholder: "150",
						},
					]}
					displayName={(row) => String(row.locationName)}
				/>
			</CardContent>
			</Card>
		</div>
	);
}
