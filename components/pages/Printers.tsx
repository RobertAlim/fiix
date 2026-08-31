"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MasterDataManager } from "@/components/MasterDataManager";
import { ImportCsvModalButton } from "@/components/ImportCsvModalButton";
import { Button } from "@/components/ui/button";
import {
	Printer,
	ArrowLeftRight,
	MapPinOff,
	CircleCheck,
	CircleDot,
} from "lucide-react";
import { format } from "date-fns";
import {
	PrinterTransferDialog,
	type TransferTarget,
} from "@/components/PrinterTransferDialog";
import { PrinterHistoryDialog } from "@/components/PrinterHistoryDialog";
import { PrinterQrCodeButton } from "@/components/PrinterQrCodeButton";

export default function PrintersPage() {
	const [transferTarget, setTransferTarget] = useState<TransferTarget | null>(
		null
	);
	const [historyPrinterId, setHistoryPrinterId] = useState<number | null>(null);

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
						{
							param: "status",
							label: "Status",
							type: "select",
							// Same three values as the Status column's own badges
							// and the Edit Printer form's radio-card options below —
							// see printers.status's doc comment in db/schema.ts.
							options: [
								{ value: "Active", label: "Active" },
								{ value: "Inactive", label: "Inactive" },
								{ value: "Missing", label: "Missing" },
							],
						},
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
									<span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
										<MapPinOff className="h-3 w-3" /> Missing
									</span>
								) : r.status === "Inactive" ? (
									<span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
										<CircleDot className="h-3 w-3" /> Inactive
									</span>
								) : (
									<span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
										<CircleCheck className="h-3 w-3" /> Active
									</span>
								),
						},
					]}
					fields={[
						{
							name: "status",
							label: "Status",
							type: "radio-card",
							required: true,
							defaultValue: "Active",
							radioOptions: [
								{ value: "Active", label: "Active", color: "green", icon: <CircleCheck /> },
								{ value: "Inactive", label: "Inactive", color: "blue", icon: <CircleDot /> },
								{ value: "Missing", label: "Missing", color: "red", icon: <MapPinOff /> },
							],
						},
						{
							name: "serialNo",
							label: "Serial Number",
							type: "text",
							required: true,
						},
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
						<>
							<PrinterQrCodeButton serialNo={String(row.serialNo)} />
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
						</>
					)}
					onRowClick={(row) => setHistoryPrinterId(Number(row.id))}
				/>
			</CardContent>

			<PrinterTransferDialog
				target={transferTarget}
				onOpenChange={(open) => {
					if (!open) setTransferTarget(null);
				}}
			/>

			<PrinterHistoryDialog
				printerId={historyPrinterId}
				onOpenChange={(open) => {
					if (!open) setHistoryPrinterId(null);
				}}
			/>
		</Card>
	);
}
