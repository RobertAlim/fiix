// components/PrinterComponents.tsx
"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
	useReactTable,
	getCoreRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	SortingState,
	PaginationState,
} from "@tanstack/react-table";

import { fetchData } from "@/lib/fetchData"; // Adjust path to your fetchData utility
import { Printer, MaintenanceHistory } from "@/types/index"; // Adjust path to your types
import { Datatable } from "./ui/data-table";
// Shadcn UI components
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton"; // For loading state
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // For error state
import { Terminal } from "lucide-react"; // Example icon for Alert

import { maintenanceHistoryColumns } from "./columns/maintenance-history/columns"; // Import the new columns

interface PrinterComponentsProps {
	serialNo: string;
}

export function PrinterComponents({ serialNo }: PrinterComponentsProps) {
	// --- Fetch Printer Data ---
	const {
		data: printer,
		isLoading: isLoadingPrinter,
		isError: isErrorPrinter,
		error: printerError,
	} = useQuery<Printer, Error>({
		queryKey: ["printer", serialNo],
		queryFn: async () => {
			if (!serialNo) {
				throw new Error("Serial number is required to fetch printer details.");
			}
			// Assuming your API returns a single printer or an array where you take the first one
			const response = await fetchData<Printer[]>(
				`/api/printers?serialNo=${serialNo}`
			);
			if (response && response.length > 0) {
				return response[0];
			}
			throw new Error("Printer not found.");
		},
		enabled: !!serialNo, // Only run query if serialNo is provided
		staleTime: 1000 * 60 * 5, // Cache printer data for 5 minutes
	});

	// --- Fetch Maintenance History Data ---
	const [historySorting, setHistorySorting] = useState<SortingState>([]);
	const [historyPagination, setHistoryPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 5,
	});

	const {
		data: maintenanceHistory,
		isLoading: isLoadingHistory,
		isError: isErrorHistory,
		error: historyError,
	} = useQuery<MaintenanceHistory[], Error>({
		queryKey: [
			"maintenanceHistory",
			serialNo,
			historyPagination,
			historySorting,
		], // Add pagination/sorting to key if backend handles it
		queryFn: async () => {
			if (!serialNo) {
				throw new Error(
					"Serial number is required to fetch maintenance history."
				);
			}
			return fetchData<MaintenanceHistory[]>(
				`/api/maintenance-history?serialNo=${serialNo}`
			);
		},
		enabled: !!serialNo, // Only run query if serialNo is provided
		staleTime: 1000 * 60 * 1, // Cache history for 1 minute
	});

	// --- React Table for Maintenance History ---
	const tableHistory = useReactTable({
		data: maintenanceHistory || [],
		columns: maintenanceHistoryColumns,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getSortedRowModel: getSortedRowModel(),
		onSortingChange: setHistorySorting,
		onPaginationChange: setHistoryPagination,
		state: {
			sorting: historySorting,
			pagination: historyPagination,
		},
		// Add other table features like filtering if needed
		// getFilteredRowModel: getFilteredRowModel(),
		// onGlobalFilterChange: setHistoryGlobalFilter,
		// globalFilter: historyGlobalFilter,
	});

	if (!serialNo) {
		return (
			<Alert>
				<Terminal className="h-4 w-4" />
				<AlertTitle>No Printer Selected</AlertTitle>
				<AlertDescription>
					Please select a printer to view its details and history.
				</AlertDescription>
			</Alert>
		);
	}

	if (isLoadingPrinter) {
		return (
			<Card className="w-full">
				<CardHeader>
					<Skeleton className="h-6 w-1/3" />
				</CardHeader>
				<CardContent className="space-y-4">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-40 w-full" />
				</CardContent>
			</Card>
		);
	}

	if (isErrorPrinter) {
		return (
			<Alert variant="destructive">
				<Terminal className="h-4 w-4" />
				<AlertTitle>Error Loading Printer</AlertTitle>
				<AlertDescription>
					{printerError?.message || "Failed to load printer details."}
				</AlertDescription>
			</Alert>
		);
	}

	if (!printer) {
		return (
			<Alert>
				<Terminal className="h-4 w-4" />
				<AlertTitle>Printer Not Found</AlertTitle>
				<AlertDescription>
					No printer found with serial number: {serialNo}.
				</AlertDescription>
			</Alert>
		);
	}

	return (
		<div className="grid grid-cols-1 gap-4">
			<Card className="w-full">
				<CardHeader>
					<CardTitle>Printer Details: {printer.serialNo}</CardTitle>
				</CardHeader>
				<CardContent className="space-y-6">
					{/* Printer Data (Form-like) */}
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div>
							<Label htmlFor="model">Client</Label>
							<Input id="client" value={printer.client || ""} disabled />
						</div>
						<div>
							<Label htmlFor="location">Location</Label>
							<Input id="location" value={printer.location || ""} disabled />
						</div>
						<div>
							<Label htmlFor="department">Department</Label>
							<Input
								id="department"
								value={printer.department || ""}
								disabled
							/>
						</div>
						<div>
							<Label htmlFor="model">Model</Label>
							<Input id="model" value={printer.model || ""} disabled />
						</div>
						<div>
							<Label htmlFor="deploymentDate">First Deployment Date</Label>
							<Input
								id="deploymentDate"
								value={printer.deploymentDate || ""}
								disabled
							/>
						</div>
						<div>
							<Label htmlFor="deployedClient">Deployed At</Label>
							<Input
								id="deployedClient"
								value={printer.deployedClient || ""}
								disabled
							/>
						</div>
					</div>

					{/* Maintenance History Datatable */}
					<div className="mt-8">
						<h3 className="text-lg font-semibold mb-4">Maintenance History</h3>
						{isLoadingHistory ? (
							<Skeleton className="h-[200px] w-full" />
						) : isErrorHistory ? (
							<Alert variant="destructive">
								<Terminal className="h-4 w-4" />
								<AlertTitle>Error Loading History</AlertTitle>
								<AlertDescription>
									{historyError?.message ||
										"Failed to load maintenance history."}
								</AlertDescription>
							</Alert>
						) : (
							<Datatable
								table={tableHistory}
								columns={maintenanceHistoryColumns}
								data={maintenanceHistory || []}
							/>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
