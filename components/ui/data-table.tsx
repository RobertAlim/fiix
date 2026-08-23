//data-table.tsx
"use client";

import React from "react";

import {
	ColumnDef,
	flexRender,
	Table as ReactTableInstance, // Import type alias to avoid conflict with HTML Table
} from "@tanstack/react-table";

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";

interface DataTableProps<TData> {
	table: ReactTableInstance<TData>;
	columns: ColumnDef<TData>[];
	data: TData[];
}

export const Datatable = //React.memo(
	// Give the inner function a name for better debugging in React DevTools
	function DatatableInternal<TData>(props: DataTableProps<TData>) {
		const { table, columns } = props;

		return (
			<div className="w-full rounded-md border">
				{/* Vertical scroll for row overflow; Table itself (ui/table.tsx)
				    already wraps in its own horizontal ScrollArea for wide
				    grids, so this only needs to add the vertical axis. */}
				<ScrollArea className="max-h-[70vh] w-full">
				<Table className="min-w-[600px] w-full table-auto text-sm">
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow key={headerGroup.id}>
								{headerGroup.headers.map((header) => {
									return (
										<TableHead
											key={header.id}
											className={`${
												header.column.getIsPinned() === "right" &&
												"sticky right-0 z-10 bg-white dark:bg-background text-gray-900 dark:text-gray-50"
											}`}
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
						{table.getRowModel().rows?.length ? (
							table.getRowModel().rows.map((row) => (
								<TableRow
									key={row.id}
									data-state={row.getIsSelected() && "selected"}
									className="odd:bg-gray-50 even:bg-white hover:bg-gray-100 dark:odd:bg-gray-900 dark:even:bg-gray-950 dark:hover:bg-gray-800"
								>
									{row.getVisibleCells().map((cell) => (
										<TableCell
											key={cell.id}
											className={`${
												cell.column.getIsPinned() === "right" &&
												"sticky right-0 z-10 bg-white dark:bg-background text-gray-900 dark:text-gray-50"
											}`}
										>
											{cell.column.getIsPinned() !== "right" ? (
												flexRender(
													cell.column.columnDef.cell,
													cell.getContext()
												)
											) : (
												<div className="sticky right-0 z-10 w-8 h-8 text-center items-center rounded-lg bg-green-200 dark:bg-green-800 text-gray-900 dark:text-gray-50">
													{flexRender(
														cell.column.columnDef.cell,
														cell.getContext()
													)}
												</div>
											)}
										</TableCell>
									))}
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell
									colSpan={columns.length}
									// colSpan={table.getAllColumns().length}
									className="h-24 text-center"
								>
									No results.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
				</ScrollArea>
			</div>
		);
	};
// ) as <TData>(props: DataTableProps<TData>) => React.ReactElement;
