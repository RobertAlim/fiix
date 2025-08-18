// src/components/ui/combobox-responsive.tsx
"use client";

import * as React from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput, // <-- We need to bind this
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Drawer,
	DrawerContent,
	DrawerTitle,
	DrawerTrigger,
} from "@/components/ui/drawer";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Define a generic type for the items in the combobox
export type ComboboxItem = {
	value: string; // The unique identifier (e.g., client.id, location.id)
	label: string; // The display name (e.g., client.name, location.name)
};

type ComboBoxResponsiveProps = {
	data: ComboboxItem[];
	placeholder?: string;
	selectedValue?: string | null; // The currently selected value (ID) from parent
	onValueChange: (value: string | null) => void; // Callback to parent
	disabled?: boolean;
	emptyMessage?: string;
};

export const ComboBoxResponsive = ({
	data,
	placeholder = "Select item...",
	selectedValue,
	onValueChange,
	disabled = false,
	emptyMessage = "No results found.",
}: ComboBoxResponsiveProps) => {
	const [open, setOpen] = React.useState(false);
	const isDesktop = useMediaQuery("(min-width: 768px)");

	// The displayLabel is still used for the Button trigger
	const displayLabel = selectedValue
		? data.find((item) => String(item.value) === String(selectedValue))?.label
		: null; // Make it null if nothing selected, so placeholder works

	// Render logic based on desktop or mobile
	const Content = (
		<StatusList
			data={data}
			setOpen={setOpen}
			selectedValue={selectedValue}
			onValueChange={onValueChange}
			emptyMessage={emptyMessage}
		/>
	);

	if (isDesktop) {
		return (
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						disabled={disabled}
						className={cn(
							"w-full justify-between",
							selectedValue ? "text-foreground" : "text-muted-foreground"
						)}
					>
						{displayLabel || placeholder}
						<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
					</Button>
				</PopoverTrigger>
				<PopoverContent
					className="w-[var(--radix-popover-trigger-width)] p-0"
					align="start"
				>
					{Content}
				</PopoverContent>
			</Popover>
		);
	}

	return (
		<Drawer open={open} onOpenChange={setOpen}>
			<DrawerTrigger asChild>
				<Button
					variant="outline"
					disabled={disabled}
					className={cn(
						"w-full justify-between",
						selectedValue ? "text-foreground" : "text-muted-foreground"
					)}
				>
					{displayLabel || placeholder}
					<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
				</Button>
			</DrawerTrigger>
			<DrawerContent>
				<DrawerTitle className="px-4 pt-4">{placeholder}</DrawerTitle>
				<div className="mt-4 border-t">{Content}</div>
			</DrawerContent>
		</Drawer>
	);
};

// Refactor StatusList to be controlled by ComboBoxResponsive's props
function StatusList({
	data,
	setOpen,
	selectedValue,
	onValueChange,
	emptyMessage,
}: {
	data: ComboboxItem[];
	setOpen: (open: boolean) => void;
	selectedValue?: string | null;
	onValueChange: (value: string | null) => void;
	emptyMessage: string;
}) {
	return (
		<Command>
			<CommandInput placeholder="Filter search..." />
			<CommandList>
				<CommandEmpty>{emptyMessage}</CommandEmpty>
				<CommandGroup>
					{data.map((item) => (
						<CommandItem
							key={item.value}
							value={item.label} // CommandItem needs label for searching
							onSelect={(currentLabel) => {
								const foundItem =
									data.find(
										(d) => d.label.toLowerCase() === currentLabel.toLowerCase()
									) || null;

								onValueChange(foundItem ? foundItem.value : null);
								setOpen(false);
							}}
							className={cn(
								"flex items-center",
								selectedValue === item.value ? "bg-accent" : ""
							)}
						>
							{item.label}
							<Check
								className={cn(
									"ml-auto h-4 w-4",
									selectedValue === item.value ? "opacity-100" : "opacity-0"
								)}
							/>
						</CommandItem>
					))}
				</CommandGroup>
			</CommandList>
		</Command>
	);
}
