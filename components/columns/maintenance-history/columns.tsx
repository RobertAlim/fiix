// components/maintenance-history/columns.tsx
"use client";

import { ColumnDef } from "@tanstack/react-table";
import { MaintenanceHistory } from "@/types/index"; // Adjust path if needed
import { Checkbox } from "@/components/ui/checkbox";

export const maintenanceHistoryColumns: ColumnDef<MaintenanceHistory>[] = [
	{
		accessorKey: "id",
		header: "MT ID",
	},
	{
		accessorKey: "client",
		header: "Client",
	},
	{
		accessorKey: "location",
		header: "Location",
	},
	{
		accessorKey: "department",
		header: "Department",
	},
	{
		header: "Head Clean",
		accessorKey: "headClean",
		cell: ({ row }) => {
			// Get the boolean value from the row
			const value = row.getValue("headClean");

			// Ensure it's treated as a boolean, as getValue might return any type
			const isChecked = typeof value === "boolean" ? value : !!value;

			return (
				<div className="font-medium text-center">
					<Checkbox
						checked={isChecked}
						disabled // Make it read-only for display purposes
						aria-label="headClean" // Accessibility label
					/>
				</div>
			);
		},
	},
	{
		header: "Ink Flush",
		accessorKey: "inkFlush",
		cell: ({ row }) => {
			// Get the boolean value from the row
			const value = row.getValue("inkFlush");

			// Ensure it's treated as a boolean, as getValue might return any type
			const isChecked = typeof value === "boolean" ? value : !!value;

			return (
				<div className="font-medium text-center">
					<Checkbox
						checked={isChecked}
						disabled // Make it read-only for display purposes
						aria-label="inkFlush" // Accessibility label
					/>
				</div>
			);
		},
	},
	{
		accessorKey: "refillInk",
		header: "Refill Ink",
		cell: ({ row }) => {
			// Get the value from the row
			const value: string = row.getValue("refillInk");

			// Removed the unnecessary leading comma and space (, )
			const cleaned = value.replace(/^,\s*/, "");

			return <div className="font-medium">{cleaned}</div>;
		},
	},
	{
		accessorKey: "reset",
		header: "Reset",
		cell: ({ row }) => {
			// Get the value from the row
			const value: string = row.getValue("reset");

			// Removed the unnecessary leading comma and space (, )
			const cleaned = value.replace(/^,\s*/, "");

			return <div className="font-medium">{cleaned}</div>;
		},
	},
	{
		header: "Clean Printer",
		accessorKey: "cleanPrinter",
		cell: ({ row }) => {
			// Get the boolean value from the row
			const value = row.getValue("cleanPrinter");

			// Ensure it's treated as a boolean, as getValue might return any type
			const isChecked = typeof value === "boolean" ? value : !!value;

			return (
				<div className="font-medium text-center">
					<Checkbox
						checked={isChecked}
						disabled // Make it read-only for display purposes
						aria-label="cleanPrinter" // Accessibility label
					/>
				</div>
			);
		},
	},
	{
		header: "Clean Waste",
		accessorKey: "cleanWasteTank",
		cell: ({ row }) => {
			// Get the boolean value from the row
			const value = row.getValue("cleanWasteTank");

			// Ensure it's treated as a boolean, as getValue might return any type
			const isChecked = typeof value === "boolean" ? value : !!value;

			return (
				<div className="font-medium text-center">
					<Checkbox
						checked={isChecked}
						disabled // Make it read-only for display purposes
						aria-label="cleanWasteTank" // Accessibility label
					/>
				</div>
			);
		},
	},
	{
		accessorKey: "replaceParts",
		header: "Replace",
	},
	{
		accessorKey: "repairParts",
		header: "Repair",
	},
	{
		header: "Replace Unit",
		accessorKey: "replaceUnit",
		cell: ({ row }) => {
			// Get the boolean value from the row
			const value = row.getValue("replaceUnit");

			// Ensure it's treated as a boolean, as getValue might return any type
			const isChecked = typeof value === "boolean" ? value : !!value;

			return (
				<div className="font-medium text-center">
					<Checkbox
						checked={isChecked}
						disabled // Make it read-only for display purposes
						aria-label="replaceUnit" // Accessibility label
					/>
				</div>
			);
		},
	},
	{
		accessorKey: "replaceSerialNo",
		header: "Serial No.",
	},
	{
		accessorKey: "status",
		header: "Status",
	},
	{
		accessorKey: "notes",
		header: "Notes",
	},
	{
		accessorKey: "technician",
		header: "Technician",
	},
	{
		accessorKey: "signatory",
		header: "Signatory",
	},
	{
		accessorKey: "mtDate",
		header: "Date",
		cell: ({ row }) => {
			const dateString = row.getValue("mtDate") as string;
			if (!dateString) return null;
			const date = new Date(dateString);
			return (
				<div>
					{date.toLocaleString("en-US", {
						month: "2-digit",
						day: "2-digit",
						year: "numeric",
						hour: "2-digit",
						minute: "2-digit",
						hour12: true,
					})}
				</div>
			);
		},
	},
	// Add more columns here if your MaintenanceHistory has other relevant fields
];
