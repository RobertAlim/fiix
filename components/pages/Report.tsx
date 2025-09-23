"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
	ColumnDef,
	ColumnFiltersState,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	SortingState,
	useReactTable,
	VisibilityState,
} from "@tanstack/react-table";
import { Skeleton } from "@/components/ui/skeleton"; // shadcn/ui Skeleton for loading state
import { useQuery } from "@tanstack/react-query"; // Import useQuery
import { ArrowUpDown, ChevronDown, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

export type Maintenance = {
	id: number;
	serialNo: string;
	client: string;
	location: string;
	department: string;
	status:
		| "Good Condition"
		| "Replacement (Unit)"
		| "Replacement (Parts)"
		| "Pulled Out";
	technician: string;
	date: string;
};

const handlePrintMaintenance = (mtId: number) => {
	const url = `/api/pdf?mtId=${mtId}`;
	window.open(url, "_blank");
};

export const columns: ColumnDef<Maintenance>[] = [
	{
		id: "select",
		minSize: 50, // Give checkbox a minimum space
		size: 50, // A preferred size too
		maxSize: 50,
		header: ({ table }) => (
			<Checkbox
				checked={
					table.getIsAllPageRowsSelected() ||
					(table.getIsSomePageRowsSelected() && "indeterminate")
				}
				onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
				aria-label="Select all"
			/>
		),
		cell: ({ row }) => (
			<Checkbox
				checked={row.getIsSelected()}
				onCheckedChange={(value) => row.toggleSelected(!!value)}
				aria-label="Select row"
			/>
		),
		enableSorting: false,
		enableHiding: false,
	},
	{
		accessorKey: "client",
		minSize: 100, // Give client a minimum space
		header: ({ column }) => {
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					Client
					<ArrowUpDown />
				</Button>
			);
		},
		cell: ({ row }) => (
			<div className="capitalize">{row.getValue("client")}</div>
		),
	},
	{
		accessorKey: "location",
		minSize: 100, // Give location a minimum space
		header: ({ column }) => {
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					Location
					<ArrowUpDown />
				</Button>
			);
		},
		cell: ({ row }) => (
			<div className="capitalize">{row.getValue("location")}</div>
		),
	},
	{
		accessorKey: "department",
		minSize: 100, // Give department a minimum space
		header: ({ column }) => {
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					Department
					<ArrowUpDown />
				</Button>
			);
		},
		cell: ({ row }) => (
			<div className="capitalize">{row.getValue("department")}</div>
		),
	},
	{
		accessorKey: "status",
		minSize: 100, // Give status a minimum space
		header: ({ column }) => {
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					Status
					<ArrowUpDown />
				</Button>
			);
		},
		cell: ({ row }) => (
			<div className="capitalize">{row.getValue("status")}</div>
		),
	},
	{
		accessorKey: "technician",
		minSize: 100, // Give technician a minimum space
		header: ({ column }) => {
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					Technician
					<ArrowUpDown />
				</Button>
			);
		},
		cell: ({ row }) => (
			<div className="capitalize">{row.getValue("technician")}</div>
		),
	},
	{
		accessorKey: "date",
		minSize: 100, // Give date a minimum space
		header: ({ column }) => {
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					Date
					<ArrowUpDown />
				</Button>
			);
		},
		cell: ({ row }) => {
			return <div className="font-medium">{row.getValue("date")}</div>;
		},
	},
	{
		id: "actions",
		minSize: 80, // Give checkbox a minimum space
		size: 80, // A preferred size too
		maxSize: 80,
		enableHiding: false,
		cell: ({ row }) => {
			const maintenance = row.original;

			return (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" className="h-8 w-8 p-0">
							<span className="sr-only">Open menu</span>
							<MoreHorizontal />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuLabel>Actions</DropdownMenuLabel>
						<DropdownMenuItem
							onClick={() =>
								navigator.clipboard.writeText(maintenance.serialNo)
							}
						>
							Copy Serial Number
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={() => handlePrintMaintenance(maintenance.id)}
						>
							Print maintenance
						</DropdownMenuItem>
						<DropdownMenuItem>View maintenance details</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			);
		},
	},
];

export default function ReportPage() {
	// Use the useQuery hook to fetch data
	const { data, isLoading, isError, error } = useQuery<Maintenance[], Error>({
		queryKey: ["maintenanceData"], // Unique key for this query
		queryFn: async () => {
			const response = await fetch("/api/maintain-report");
			if (!response.ok) {
				throw new Error(`Failed to fetch data: ${response.statusText}`);
			}

			return response.json();
		},
		refetchOnWindowFocus: false, //if you don't want to refetch on tab focus
		staleTime: 1000 * 60 * 5, // Data considered fresh for 5 minutes
	});
	console.log("Fetched maintenance data:", data);
	const [globalFilter, setGlobalFilter] = React.useState("");
	const [sorting, setSorting] = React.useState<SortingState>([]);
	const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
		[]
	);
	const [columnVisibility, setColumnVisibility] =
		React.useState<VisibilityState>({});
	const [rowSelection, setRowSelection] = React.useState({});
	const table = useReactTable({
		data: data || [],
		columns,
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		onColumnVisibilityChange: setColumnVisibility,
		onRowSelectionChange: setRowSelection,
		state: {
			sorting,
			columnFilters,
			columnVisibility,
			rowSelection,
			globalFilter: globalFilter, // Link globalFilter state to table
		},
		onGlobalFilterChange: setGlobalFilter, // Update globalFilter state when input changes
	});

	if (isLoading) {
		return (
			<div className="p-4">
				<h2 className="text-2xl font-bold mb-4">Maintenance Records</h2>
				<div className="rounded-md border p-4 space-y-3">
					<Skeleton className="h-8 w-48" /> {/* Filter input skeleton */}
					<Skeleton className="h-10 w-full" /> {/* Header row skeleton */}
					<Skeleton className="h-8 w-full" /> {/* Table row skeleton */}
					<Skeleton className="h-8 w-full" />
					<Skeleton className="h-8 w-full" />
				</div>
			</div>
		);
	}

	if (isError) {
		return (
			<div className="p-4 text-red-600">
				<h2 className="text-2xl font-bold mb-4">Maintenance Records</h2>
				<p>
					Error:{" "}
					{error?.message || "Failed to load data. Please try again later."}
				</p>
			</div>
		);
	}

	// Get the total number of records (filtered)
	const totalRecordsCount = table.getFilteredRowModel().rows.length;

	// Format the total records count with a thousand separator
	const formattedTotalRecords = totalRecordsCount.toLocaleString();

	return (
		<div className="rounded-2xl grid grid-cols-1 gap-4 p-[1px] bg-gradient-to-r from-blue-400 via-green-500 to-red-400">
			<Card className="rounded-2xl bg-white dark:bg-black">
				<CardContent className="p-6 space-y-4">
					<div className="grid grid-cols-1 gap-4">
						<div className="flex items-center py-4">
							<Input
								placeholder="Filter all columns..."
								value={globalFilter ?? ""}
								onChange={(event) => setGlobalFilter(event.target.value)} // Update globalFilter state
								className="max-w-sm"
							/>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="outline" className="ml-auto">
										Columns <ChevronDown />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									{table
										.getAllColumns()
										.filter((column) => column.getCanHide())
										.map((column) => {
											return (
												<DropdownMenuCheckboxItem
													key={column.id}
													className="capitalize"
													checked={column.getIsVisible()}
													onCheckedChange={(value) =>
														column.toggleVisibility(!!value)
													}
												>
													{column.id}
												</DropdownMenuCheckboxItem>
											);
										})}
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
						<div className="rounded-md border overflow-x-auto">
							<Table>
								<TableHeader>
									{table.getHeaderGroups().map((headerGroup) => (
										<TableRow key={headerGroup.id}>
											{headerGroup.headers.map((header) => {
												return (
													<TableHead key={header.id}>
														{header.isPlaceholder
															? null
															: flexRender(
																	header.column.columnDef.header,
																	header.getContext()
															  )}
													</TableHead>
												);
											})}
										</TableRow>
									))}
								</TableHeader>
								<TableBody>
									{table.getRowModel().rows?.length ? (
										table.getRowModel().rows.map((row) => (
											<TableRow
												key={row.id}
												data-state={row.getIsSelected() && "selected"}
												className="odd:bg-gray-50 even:bg-white hover:bg-gray-100 dark:odd:bg-gray-900 dark:even:bg-gray-950 dark:hover:bg-gray-800"
											>
												{row.getVisibleCells().map((cell) => (
													<TableCell key={cell.id}>
														{flexRender(
															cell.column.columnDef.cell,
															cell.getContext()
														)}
													</TableCell>
												))}
											</TableRow>
										))
									) : (
										<TableRow>
											<TableCell
												colSpan={columns.length}
												className="h-24 text-center"
											>
												No results.
											</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>
						</div>

						<div className="flex items-center justify-end space-x-2 py-4">
							<div className="text-muted-foreground flex-1 text-sm">
								{table.getFilteredSelectedRowModel().rows.length} of{" "}
								{formattedTotalRecords} row(s) selected.
							</div>
							{/* Page Number and Total Records */}
							<div className="text-sm text-muted-foreground mr-4">
								Page {table.getState().pagination.pageIndex + 1} of{" "}
								{table.getPageCount()} (Total records: {formattedTotalRecords})
							</div>
							<div className="space-x-2">
								<Button
									variant="outline"
									size="sm"
									onClick={() => table.previousPage()}
									disabled={!table.getCanPreviousPage()}
								>
									Previous
								</Button>
								<Button
									variant="outline"
									size="sm"
									onClick={() => table.nextPage()}
									disabled={!table.getCanNextPage()}
								>
									Next
								</Button>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);

	// return (
	// 	<div className="p-4">
	// 		<h1 className="text-xl font-bold mb-4">React PDF in Next.js</h1>
	// 		<a
	// 			href="/api/pdf"
	// 			target="_blank"
	// 			rel="noopener noreferrer"
	// 			className="px-4 py-2 bg-blue-600 text-white rounded"
	// 		>
	// 			View PDF
	// 		</a>
	// 	</div>
	// );
}
