"use client";

import * as React from "react";
import {
	ColumnDef,
	flexRender,
	getCoreRowModel,
	useReactTable,
	ExpandedState,
	getExpandedRowModel,
} from "@tanstack/react-table";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { ChevronDown, ChevronRight, ThumbsUp } from "lucide-react";
import {
	Collapsible,
	CollapsibleContent,
	// CollapsibleTrigger // No longer directly used from Shadcn UI for the main button
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { useSchedules, Schedule } from "@/hooks/use-schedules"; // Adjust path
import { format } from "date-fns";

// Extend the ColumnMeta type to include className
// declare module "@tanstack/react-table" {
// 	interface ColumnMeta<TData extends RowData, TValue> {
// 		className?: string;
// 	}
// }

import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface SchedulesDataTableProps {
	technicianId?: number;
	scheduledAt?: string;
	onCardClick: (args: {
		serialNo: string;
		originMTId: number;
		schedDetailsId: number;
	}) => void;
}

export function SchedulesDataTable({
	technicianId,
	scheduledAt,
	onCardClick,
}: SchedulesDataTableProps) {
	const {
		data: schedulesData,
		isLoading,
		isError,
	} = useSchedules({
		technicianId,
		scheduledAt,
	});
	const [expanded, setExpanded] = React.useState<ExpandedState>({});

	const columns: ColumnDef<Schedule>[] = [
		{
			id: "expander", // Unique ID for the expander column
			header: () => null, // No header for this column
			cell: ({ row }) => {
				// This button directly controls the row's expanded state via TanStack Table.
				// It does NOT use Shadcn's CollapsibleTrigger for this setup,
				// because the Collapsible root is in a different TR/TD.
				return (
					<Button
						variant="ghost"
						size="sm"
						className="w-8 p-0"
						onClick={(e) => {
							e.stopPropagation(); // Prevent the row's click handler from firing when clicking the button
							row.getToggleExpandedHandler()();
						}}
					>
						{row.getIsExpanded() ? <ChevronDown /> : <ChevronRight />}
						<span className="sr-only">Toggle row</span>
					</Button>
				);
			},
			enableHiding: false, // Don't allow hiding this column
		},
		{
			accessorKey: "id",
			header: "Schedule ID",
			cell: ({ row }) => row.getValue("id"),
			meta: {
				className: "hidden sm:table-cell",
			},
		},
		{
			accessorFn: (row) => row.client?.name || "",
			id: "client",
			header: () => "Client",
		},
		{
			// CORRECTED: Access the 'name' property
			accessorFn: (row) => row.location?.name || "",
			id: "location",
			header: "Location",
			cell: ({ row }) => row.getValue("location"),
			meta: {
				className: "hidden md:table-cell",
			},
		},
		{
			// CORRECTED: Access the 'name' property
			accessorFn: (row) => row.priorityLevel?.name || "",
			id: "priority",
			header: "Priority",
			cell: ({ row }) => row.getValue("priority"),
			meta: {
				className: "hidden lg:table-cell",
			},
		},
		{
			accessorKey: "notes",
			header: "Notes",
			cell: ({ row }) => row.getValue("notes"),
			meta: {
				className: "hidden lg:table-cell",
			},
		},
		// Add more parent table columns as needed
	];

	const table = useReactTable({
		data: schedulesData || [],
		columns,
		state: {
			expanded,
		},
		onExpandedChange: setExpanded,
		getCoreRowModel: getCoreRowModel(),
		getExpandedRowModel: getExpandedRowModel(),
		getRowCanExpand: () => true, // All rows can be expanded
	});

	if (isLoading) return <div>Loading schedules...</div>;
	if (isError) return <div>Error loading schedules.</div>;

	return (
		<div className="rounded-md border">
			<Table>
				<TableHeader>
					{table.getHeaderGroups().map((headerGroup) => (
						<TableRow key={headerGroup.id}>
							{headerGroup.headers.map((header) => {
								return (
									<TableHead
										key={header.id}
										className={header.column.columnDef.meta?.className}
									>
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
					{table.getRowModel().rows.length ? (
						table.getRowModel().rows.map((row) => (
							<React.Fragment key={row.id}>
								<TableRow
									onClick={row.getToggleExpandedHandler()}
									data-state={row.getIsExpanded() && "expanded"}
									className="cursor-pointer"
								>
									{row.getVisibleCells().map((cell) => (
										<TableCell
											key={cell.id}
											className={cell.column.columnDef.meta?.className}
										>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext()
											)}
										</TableCell>
									))}
								</TableRow>

								{row.getIsExpanded() && (
									<TableRow>
										<TableCell colSpan={columns.length}>
											<Collapsible open={row.getIsExpanded()}>
												<CollapsibleContent asChild>
													<div className="py-2 px-2 bg-gray-50 dark:bg-gray-900 border-t">
														<h4 className="font-semibold mb-2 text-lg">
															Schedule Details:
														</h4>
														<span className="font-medium">Legend:</span>
														<div className="grid grid-cols-2 md:grid-cols-4 mb-2">
															<div className="flex flex-col items-center space-x-1">
																<Badge variant={"secondary"}>RM</Badge>
																<span className="text-xs">
																	Regular Maintenance
																</span>
															</div>

															<div className="flex flex-col items-center space-x-1">
																<Badge variant={"destructive"}>RU</Badge>
																<span className="text-xs">
																	Replacement (Unit)
																</span>
															</div>
															<div className="flex flex-col items-center space-x-1">
																<Badge variant={"destructive"}>RP</Badge>
																<span className="text-xs">
																	Replacement (Parts)
																</span>
															</div>
															<div className="flex flex-col items-center space-x-1">
																<Badge variant={"default"}>PO</Badge>
																<span className="text-xs">Pulled Out</span>
															</div>
														</div>
														{row.original.scheduleDetails.length > 0 ? (
															<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
																{" "}
																{/* Use Grid for layout */}
																{row.original.scheduleDetails.map((detail) => {
																	const latestMaintainStatus =
																		// detail.printer.maintenanceRecords[0]; // Get the latest (first) record
																		detail.maintainRecord?.status.name;
																	return (
																		<Card
																			key={detail.id}
																			className={`relative shadow-md ${
																				!detail.isMaintained // Kung maintained, normal interactive styles
																					? "cursor-pointer transition-colors duration-200 hover:bg-blue-100 dark:hover:bg-blue-900/50"
																					: "cursor-not-allowed opacity-70" // Kung disabled, palitan ang cursor, lower opacity, at gawing grayscale
																			}`}
																			onClick={
																				!detail.isMaintained
																					? () =>
																							onCardClick({
																								serialNo:
																									detail.printer?.serialNo,
																								originMTId: detail.originMTId,
																								schedDetailsId: detail.id,
																							})
																					: undefined // Kung false ang isMaintained, gawing undefined ang onClick para hindi clickable
																			}
																		>
																			{/* ThumbsUp icon positioned absolutely */}

																			<CardHeader>
																				<CardTitle className="flex justify-between items-center text-base">
																					<span>
																						Printer:{" "}
																						{detail.printer?.serialNo || "N/A"}
																					</span>
																					{latestMaintainStatus && (
																						<Badge
																							variant={
																								latestMaintainStatus ===
																								"Pulled Out" // First, check if it's "Pulled Out"
																									? "default" // If true, apply "secondary" variant
																									: latestMaintainStatus ===
																											"Replacement (Unit)" ||
																									  latestMaintainStatus ===
																											"Replacement (Parts)"
																									? "destructive" // If not "Pulled Out", then check for "Replacement" statuses
																									: "secondary" // If neither "Pulled Out" nor "Replacement", apply "primary" variant
																							}
																						>
																							{/* Full text - visible on medium and larger screens, hidden on small screens */}
																							<span className="hidden sm:inline">
																								{latestMaintainStatus ===
																								"Pulled Out"
																									? "Pulled Out"
																									: latestMaintainStatus ===
																											"Replacement (Unit)" ||
																									  latestMaintainStatus ===
																											"Replacement (Parts)"
																									? latestMaintainStatus
																									: "Regular Maintenance"}
																							</span>

																							{/* Abbreviated text - visible on small screens, hidden on medium and larger screens */}
																							<span className="sm:hidden">
																								{latestMaintainStatus ===
																								"Pulled Out"
																									? "PO"
																									: latestMaintainStatus ===
																									  "Replacement (Unit)"
																									? "RU"
																									: latestMaintainStatus ===
																									  "Replacement (Parts)"
																									? "RP"
																									: "RM"}
																							</span>
																						</Badge>
																					)}
																				</CardTitle>
																				<CardDescription className="text-xs text-gray-500 dark:text-gray-400">
																					<div className="flex flex-1 justify-between">
																						<span>Detail ID: {detail.id}</span>
																						<div>
																							{detail.isMaintained && ( // Only show if maintained
																								<div className="flex text-green-500 gap-2 items-center">
																									<ThumbsUp className="h-5 w-5" />
																									{format(
																										detail.maintainedDate,
																										"MM/dd h:mm aa"
																									)}
																								</div>
																							)}
																						</div>
																					</div>
																				</CardDescription>
																			</CardHeader>
																			<CardContent className="space-y-2 text-sm">
																				<div className="flex justify-between">
																					<span className="font-medium">
																						Model:
																					</span>
																					<span>
																						{detail.printer?.model?.name ||
																							"N/A"}
																					</span>
																				</div>
																				<div className="flex justify-between">
																					<span className="font-medium">
																						Department:
																					</span>
																					<span>
																						{detail.printer?.department?.name ||
																							"N/A"}
																					</span>
																				</div>
																				<Separator className="my-2" />{" "}
																				{/* Separator for visual break */}
																				<div>
																					<span className="font-medium block mb-1">
																						Last Maintenance Notes:
																					</span>
																					<p className="text-gray-700 dark:text-gray-300">
																						{detail.maintainRecord?.notes ||
																							"No notes available for this maintenance."}
																					</p>
																				</div>
																				{/* You can add more details here, e.g., latest maintain record date */}
																				{detail.maintainRecord?.createdAt && (
																					<div className="flex flex-1 justify-baseline">
																						<p className="text-xs text-gray-500 dark:text-gray-400">
																							Last Updated:{" "}
																							{format(
																								detail.maintainRecord
																									?.createdAt,
																								"MM/dd/yyyy (EEEE)"
																							)}
																						</p>
																					</div>
																				)}
																			</CardContent>
																		</Card>
																	);
																})}
															</div>
														) : (
															<p className="text-gray-500 italic">
																No specific printer details found for this
																schedule.
															</p>
														)}
													</div>
												</CollapsibleContent>
											</Collapsible>
										</TableCell>
									</TableRow>
								)}
							</React.Fragment>
						))
					) : (
						<TableRow>
							<TableCell colSpan={columns.length} className="h-24 text-center">
								No schedules found matching the criteria.
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
		</div>
	);
}
