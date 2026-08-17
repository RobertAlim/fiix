"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MasterDataManager } from "@/components/MasterDataManager";
import { ImportCsvModalButton } from "@/components/ImportCsvModalButton";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeftRight, MapPinOff } from "lucide-react";
import { format } from "date-fns";
import {
	PrinterTransferDialog,
	type TransferTarget,
} from "@/components/PrinterTransferDialog";

export default function PrintersPage() {
	const [transferTarget, setTransferTarget] = useState<TransferTarget | null>(
		null
	);

	return (
		<Card className="rounded-2xl border shadow-sm">
			<CardHeader>
				<CardTitle className="flex items-center justify-between gap-2 text-base font-semibold">
					<span className="flex items-center gap-2">
						<Printer className="h-5 w-5 text-primary" />
						Printers
					</span>
					<ImportCsvModalButton
						tableName="Printers"
						description="Each row creates a printer (if its serial number is new) and its active deployment. A printer that already has an active deployment is skipped, not duplicated — safe to re-run on a file that includes printers you've already imported."
						endpoint="/api/admin/import/deployments"
						expectedColumns={[
							"serialNo",
							"model",
							"client",
							"location",
							"department",
							"deployedClient",
							"deploymentDate",
						]}
					/>
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
					filters={[
						{ param: "serialNo", label: "Serial No.", placeholder: "e.g. X1B2C3" },
						{ param: "client", label: "Current Client" },
						{ param: "location", label: "Location" },
						{ param: "department", label: "Department" },
						{ param: "model", label: "Model" },
					]}
					defaultPageSize={25}
					columns={[
						{ key: "serialNo", label: "Serial No.", minWidth: "min-w-[140px]" },
						// Rarely needed day-to-day and the widest of the client
						// columns — off by default, re-enable from the Columns menu.
						{
							key: "originalClientName",
							label: "Original Client",
							minWidth: "min-w-[180px]",
							hiddenByDefault: true,
						},
						{ key: "clientName", label: "Current Client", minWidth: "min-w-[180px]" },
						{ key: "locationName", label: "Location", minWidth: "min-w-[160px]", render: (r) => (r.locationName ? String(r.locationName) : "—") },
						{ key: "departmentName", label: "Department", minWidth: "min-w-[160px]", render: (r) => (r.departmentName ? String(r.departmentName) : "—") },
						{ key: "modelName", label: "Model", minWidth: "min-w-[150px]", render: (r) => (r.modelName ? String(r.modelName) : "—") },
						{
							key: "deploymentDate",
							label: "Deployed",
							minWidth: "min-w-[110px]",
							render: (r) =>
								r.deploymentDate
									? format(new Date(String(r.deploymentDate)), "MM/dd/yyyy")
									: "—",
						},
						{
							key: "status",
							label: "Status",
							minWidth: "min-w-[100px]",
							render: (r) =>
								r.status === "Missing" ? (
									<span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
										<MapPinOff className="h-3 w-3" /> Missing
									</span>
								) : (
									<span className="text-xs text-muted-foreground">Active</span>
								),
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
					rowActions={(row) => (
						<Button
							variant="ghost"
							size="icon"
							onClick={() =>
								setTransferTarget({
									id: Number(row.id),
									serialNo: String(row.serialNo),
									clientName: row.clientName ? String(row.clientName) : null,
									locationName: row.locationName
										? String(row.locationName)
										: null,
									status: row.status ? String(row.status) : null,
								})
							}
							aria-label={`Transfer ${String(row.serialNo)}`}
							title="Transfer to another client / location"
						>
							<ArrowLeftRight className="h-4 w-4 text-primary" />
						</Button>
					)}
				/>
			</CardContent>

			<PrinterTransferDialog
				target={transferTarget}
				onOpenChange={(open) => {
					if (!open) setTransferTarget(null);
				}}
			/>
		</Card>
	);
}
