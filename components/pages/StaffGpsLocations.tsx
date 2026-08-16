"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MasterDataManager } from "@/components/MasterDataManager";
import { Navigation } from "lucide-react";

export default function StaffGpsLocationsPage() {
	return (
		<div className="space-y-6">
			<Card className="rounded-2xl border shadow-sm">
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base font-semibold">
						<Navigation className="h-5 w-5 text-primary" />
						Staff GPS Location
					</CardTitle>
					<p className="text-sm text-muted-foreground">
						GPS pin and allowed radius for each Admin or Scheduler account.
						That person can only Time In/Out from within this radius on the
						Timekeep page.
					</p>
				</CardHeader>
				<CardContent>
					<MasterDataManager
						title="Staff GPS Location"
						listEndpoint="/api/admin/master/staff-gps-locations"
						itemEndpoint={(id) => `/api/admin/master/staff-gps-locations/${id}`}
						columns={[
							{ key: "userFullName", label: "Staff", minWidth: "min-w-[200px]" },
							{ key: "label", label: "Label", minWidth: "min-w-[120px]" },
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
								name: "userId",
								label: "Staff",
								type: "select",
								required: true,
								immutable: true,
								optionsEndpoint: "/api/admin/users?role=Admin,Scheduler,Super Admin",
								optionsQueryKey: [
									"/api/admin/users?role=Admin,Scheduler,Super Admin",
								],
								optionsMap: (r) => ({
									value: String(r.id),
									label: `${r.firstName} ${r.lastName} (${r.role ?? "No role"})`,
								}),
							},
							{
								name: "label",
								label: "Label",
								type: "text",
								placeholder: "e.g. Main Office",
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
						displayName={(row) => String(row.userFullName)}
					/>
				</CardContent>
			</Card>
		</div>
	);
}
