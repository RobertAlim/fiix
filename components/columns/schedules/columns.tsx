"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowUpDown, MoreHorizontal } from "lucide-react";

export type Schedule = {
	id: string;
	technician: string;
	clientId: number;
	client: string;
	locationId: number;
	location: string;
	priorityId: number;
	priority: string;
	notes?: string;
	maintainAll: boolean;
	scheduleAt: Date;
};

// Define props that the column function will accept
interface ScheduleColumnsProps {
	onEditClick: (schedId: number) => void;
	onDeleteClick: (schedId: number) => void;
	onShowDetailsClick: (schedId: number) => void; // Optional prop for showing details
}

// Export a function that returns the columns array
export const getScheduleColumns = (
	props: ScheduleColumnsProps
): ColumnDef<Schedule>[] => {
	const { onEditClick, onDeleteClick, onShowDetailsClick } = props; // Destructure the new prop
	return [
		{
			id: "select",
			header: ({ table }) => (
				<Checkbox
					checked={
						table.getIsAllPageRowsSelected() ||
						(table.getIsSomePageRowsSelected() && "indeterminate")
					}
					onCheckedChange={(value) => table.toggleAllRowsSelected(!!value)}
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
			enableSorting: true,
			enableHiding: true,
		},
		{
			accessorKey: "technician",
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
			accessorKey: "client",
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
			accessorKey: "priority",
			header: ({ column }) => {
				return (
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						Priority
						<ArrowUpDown />
					</Button>
				);
			},
			cell: ({ row }) => {
				return <div className="font-medium">{row.getValue("priority")}</div>;
			},
		},
		{
			accessorKey: "notes",
			header: ({ column }) => {
				return (
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						Notes
						<ArrowUpDown />
					</Button>
				);
			},
			cell: ({ row }) => {
				return <div className="font-medium">{row.getValue("notes")}</div>;
			},
		},
		{
			accessorKey: "maintainAll",
			header: ({ column }) => {
				return (
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						Maintain All
						<ArrowUpDown />
					</Button>
				);
			},
			cell: ({ row }) => {
				// Get the boolean value from the row
				const maintainAllValue = row.getValue("maintainAll");

				// Ensure it's treated as a boolean, as getValue might return any type
				const isChecked =
					typeof maintainAllValue === "boolean"
						? maintainAllValue
						: !!maintainAllValue;

				return (
					<div className="font-medium text-center">
						<Checkbox
							checked={isChecked}
							disabled // Make it read-only for display purposes
							aria-label="Maintain All" // Accessibility label
						/>
					</div>
				);
			},
		},
		{
			accessorKey: "scheduleAt",
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
				return <div className="font-medium">{row.getValue("scheduleAt")}</div>;
			},
		},
		{
			id: "actions",
			enableHiding: false,
			cell: ({ row }) => {
				const schedule = row.original;

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
								onClick={() => onEditClick(Number(schedule.id))}
							>
								Edit
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => onDeleteClick(Number(schedule.id))}
							>
								Delete
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onClick={() => onShowDetailsClick(Number(schedule.id))}
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
