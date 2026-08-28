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
		// Not a new data field — `client`/`location` above are already the
		// printer's HISTORICAL assignment for this specific maintenance
		// record, not its current one. The API (app/api/maintenance-history/
		// route.ts) joins through `maintain.deploymentId` -> `deployments`
		// rather than through `printers` directly, and a printer transfer
		// (app/api/admin/master/printers/[id]/transfer) retires the old
		// deployment row (deployedHere = false) and opens a new one instead
		// of editing it in place — specifically so that every past
		// maintenance record keeps pointing at the deployment it actually
		// happened under. So a printer transferred from Client A to Client B
		// still shows "Client A — Location A" on its older rows here, and
		// only newer rows (created after the transfer) show Client B.
		//
		// That said, two separate "Client" / "Location" columns don't make
		// this obvious at a glance — they read like they could just be
		// showing the printer's current client/location, same as elsewhere
		// in the app. This combined, explicitly-labeled column exists purely
		// to communicate that clearly, without changing what data is shown.
		id: "clientLocationAtMaintenance",
		header: "Client/Location at Maintenance",
		accessorFn: (row) => `${row.client} — ${row.location}`,
		cell: ({ row }) => {
			const { client, location } = row.original;
			return (
				<div className="font-medium whitespace-nowrap">
					{client} <span className="text-muted-foreground">—</span> {location}
				</div>
			);
		},
	},
	{
		accessorKey: "gpsLocation",
		header: "GPS Location",
		cell: ({ row }) => {
			const { gpsLocation, gpsLatitude, gpsLongitude, gpsAccuracy } =
				row.original;
			if (gpsLatitude == null || gpsLongitude == null) {
				return <span className="text-muted-foreground">—</span>;
			}
			return (
				<a
					href={`https://www.google.com/maps?q=${gpsLatitude},${gpsLongitude}`}
					target="_blank"
					rel="noopener noreferrer"
					className="text-primary underline-offset-2 hover:underline"
					title={`${gpsLatitude.toFixed(6)}, ${gpsLongitude.toFixed(6)}${
						gpsAccuracy != null ? ` (±${Math.round(gpsAccuracy)}m)` : ""
					}`}
				>
					{gpsLocation ?? "View on map"}
				</a>
			);
		},
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
						// Without this the cell renders in the device's own
						// timezone, which is only coincidentally correct.
						timeZone: "Asia/Manila",
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
