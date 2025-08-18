"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";

// Define the props for your DatePicker component
interface DatePickerProps {
	onDateSelect: (date: Date | undefined) => void; // Callback function to return the selected date
	selectedDate?: Date | undefined; // Optional prop to pre-set a date
	disabled?: boolean;
}

const today = new Date();

const tomorrow = new Date(today);

tomorrow.setDate(today.getDate() + 1);

export function DatePicker({
	onDateSelect,
	selectedDate,
	disabled = false,
}: DatePickerProps) {
	const [open, setOpen] = React.useState(false);
	// Initialize internal state with the selectedDate prop, if provided
	const [date, setDate] = React.useState<Date | undefined>(selectedDate);

	// Use a React.useEffect to update the internal date state if selectedDate prop changes
	React.useEffect(() => {
		setDate(selectedDate);
	}, [selectedDate]);

	return (
		<div className="flex flex-col gap-3">
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						id="date"
						disabled={disabled}
						className="w-full justify-between font-normal"
					>
						{date ? format(date, "MM/dd/yyyy (EEEE)") : "Select date"}
						<CalendarIcon className="ml-2 h-4 w-4 text-gray-500" />{" "}
						{/* Added some styling to the icon */}
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-full overflow-hidden p-0" align="start">
					<Calendar
						mode="single"
						selected={date}
						captionLayout="dropdown"
						onSelect={(selectedDateFromCalendar) => {
							setDate(selectedDateFromCalendar); // Update internal state
							onDateSelect(selectedDateFromCalendar); // Call the callback to pass the date to the parent
							setOpen(false); // Close the popover
						}}
						disabled={
							(date) => date > tomorrow //|| date < new Date("1900-01-01")
						}
					/>
				</PopoverContent>
			</Popover>
		</div>
	);
}
