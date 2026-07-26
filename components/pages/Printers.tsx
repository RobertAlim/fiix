"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MasterDataManager } from "@/components/MasterDataManager";
import { Printer } from "lucide-react";
import { format } from "date-fns";

export default function PrintersPage() {
	return (
		<Card className="rounded-2xl border shadow-sm">
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base font-semibold">
					<Printer className="h-5 w-5 text-primary" />
					Printers
				</CardTitle>
				<p className="text-sm text-muted-foreground">
					Create and manage deployed printer units. &quot;Original Client&quot;
					is set once at creation and never changes; editing
					&quot;Client (current)&quot; records a transfer to a new client.
				</p>
			</CardHeader>
			<CardContent>
				<MasterDataManager
					title="Printer"
					listEndpoint="/api/admin/master/printers"
					itemEndpoint={(id) => `/api/admin/master/printers/${id}`}
					columns={[
						{ key: "serialNo", label: "Serial No." },
						{ key: "originalClientName", label: "Original Client" },
						{ key: "clientName", label: "Current Client" },
						{ key: "locationName", label: "Location", render: (r) => (r.locationName ? String(r.locationName) : "—") },
						{ key: "departmentName", label: "Department", render: (r) => (r.departmentName ? String(r.departmentName) : "—") },
						{ key: "modelName", label: "Model", render: (r) => (r.modelName ? String(r.modelName) : "—") },
						{
							key: "deploymentDate",
							label: "Deployed",
							render: (r) =>
								r.deploymentDate
									? format(new Date(String(r.deploymentDate)), "MM/dd/yyyy")
									: "—",
						},
					]}
					fields={[
						{ name: "serialNo", label: "Serial Number", type: "text", required: true },
						{
							name: "clientId",
							label: "Client (current)",
							type: "select",
							required: true,
							optionsEndpoint: "/api/admin/master/clients",
							optionsQueryKey: ["/api/admin/master/clients"],
						},
						{
							name: "locationId",
							label: "Location",
							type: "select",
							required: true,
							optionsEndpoint: "/api/admin/master/locations",
							optionsQueryKey: ["/api/admin/master/locations"],
							optionsMap: (r) => ({ value: String(r.id), label: `${r.name} (${r.clientName})` }),
						},
						{
							name: "departmentId",
							label: "Department",
							type: "select",
							required: true,
							optionsEndpoint: "/api/admin/master/departments",
							optionsQueryKey: ["/api/admin/master/departments"],
						},
						{
							name: "modelId",
							label: "Model",
							type: "select",
							required: true,
							optionsEndpoint: "/api/admin/master/models",
							optionsQueryKey: ["/api/admin/master/models"],
						},
						{ name: "deploymentDate", label: "Deployment Date", type: "date", required: true },
					]}
					displayName={(row) => String(row.serialNo)}
				/>
			</CardContent>
		</Card>
	);
}
