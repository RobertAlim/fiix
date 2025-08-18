"use client";

import React from "react";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowUpDown, MoreHorizontal } from "lucide-react";
import { table } from "console";

export interface Printer {
	id: number;
	department: string;
	model: string;
	serialNo: string;
	issue: string;
	status: string;
	notes: string;
	lastMt: string;
	mtId: number;
	schedDetailsId: number;
	isMaintained: boolean;
	maintainedDate: string;
	isToggled: boolean;
	onToggleChange: (newValue: boolean) => void;
}

// delta of edits
export type PrinterEdit = Partial<Pick<Printer, "isToggled">>;

export function diffPrinters(
	original: Printer[],
	current: Printer[],
	edits: Record<string, PrinterEdit>
) {
	const originalById = new Map(original.map((p) => [p.id, p]));
	const currentById = new Map(current.map((p) => [p.id, p]));

	// Added: in current but not in original
	const added = current
		.filter((p) => !originalById.has(p.id))
		.map((p) => ({
			printerId: p.id,
			mtId: p.mtId,
		}));

	// Removed: in original but not in current
	const removed = original
		.filter((p) => p.isToggled && edits[p.id]?.isToggled === false)
		.map((p) => ({
			printerId: p.id,
			mtId: p.mtId,
		}));

	// console.log("Added Printers:", added);
	// console.log("Removed Printers:", removed);
	// console.log("Original Printers:", original);
	// console.log("Current:", current);
	console.log("Edits:", edits);
	// console.log("CurrentById:", currentById);

	// Modified: exists in both and either edits record or field differs
	// const modified: Printer[] = [];
	// for (const [id, origPrinter] of originalById.entries()) {
	// 	const currPrinter = currentById.get(id);
	// 	if (!currPrinter) continue; // deleted case handled above

	// 	// If you have explicit edits tracked, prefer that as the "what changed"
	// 	if (edits[id]) {
	// 		modified.push({ ...origPrinter, ...edits[id] } as Printer);
	// 		continue;
	// 	}

	// 	// Fallback: shallow compare important fields manually
	// 	if (origPrinter.isToggled !== currPrinter.isToggled) {
	// 		modified.push(currPrinter);
	// 	}
	// 	// add other field comparisons here if needed
	// }

	return { added, removed };
}

// Define props that the column function will accept
interface PrinterColumnsProps {
	onShowDetailsClick: (serialNo: string) => void;
}

// Export a function that returns the columns array
export const getPrinterColumns = (
	props: PrinterColumnsProps
): ColumnDef<Printer>[] => {
	const { onShowDetailsClick } = props; // Destructure the new prop

	const handleMaintenanceHistory = (printerId: number) => {
		const url = `/api/pdf?mtId=${printerId}`;
		window.open(url, "_blank");
	};

	return [
		{
			id: "select",
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
			accessorKey: "department",
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
			accessorKey: "model",
			header: ({ column }) => {
				return (
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						Model
						<ArrowUpDown />
					</Button>
				);
			},
			cell: ({ row }) => (
				<div className="capitalize">{row.getValue("model")}</div>
			),
		},
		{
			accessorKey: "serialNo",
			header: ({ column }) => {
				return (
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						Serial No.
						<ArrowUpDown />
					</Button>
				);
			},
			cell: ({ row }) => (
				<div className="capitalize">{row.getValue("serialNo")}</div>
			),
		},
		{
			accessorKey: "issue",
			header: ({ column }) => {
				return (
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						Issues
						<ArrowUpDown />
					</Button>
				);
			},
			cell: ({ row }) => {
				return <div className="font-medium">{row.getValue("issue")}</div>;
			},
		},
		{
			accessorKey: "lastMT",
			header: ({ column }) => {
				return (
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						Last MT
						<ArrowUpDown />
					</Button>
				);
			},
			cell: ({ row }) => {
				return <div className="font-medium">{row.getValue("lastMT")}</div>;
			},
		},
		{
			accessorKey: "mtId",
			header: ({ column }) => {
				return (
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						MT Id
						<ArrowUpDown />
					</Button>
				);
			},
			cell: ({ row }) => {
				return <div className="font-medium">{row.getValue("mtId")}</div>;
			},
		},
		{
			id: "actions",
			enableHiding: false,
			cell: ({ row }) => {
				const printer = row.original;

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
								onClick={() => onShowDetailsClick(printer.serialNo)}
							>
								Show Details
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				);
			},
		},
	];
};
