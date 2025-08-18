// components/OpenIssueComponent.tsx
import {
	Card,
	CardContent,
	CardHeader,
	CardFooter,
	CardTitle,
	CardDescription,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { datetime } from "drizzle-orm/singlestore-core";

interface OpenIssueProps {
	id: number;
	serialNo: string;
	client: string;
	location: string;
	department: string;
	model: string;
	status: string;
	technician: string;
	date: string;
	notes?: string; // Optional notes field
}

export function OpenIssueComponent({
	id,
	serialNo,
	client,
	location,
	department,
	model,
	status,
	technician,
	date,
	notes,
}: OpenIssueProps) {
	const today = new Date();
	const createdDate = new Date(date); // Assuming createdAt from DB is a Date object

	// Set both dates to UTC midnight to ignore time part for accurate day count
	// This effectively strips the time and converts to a universal point in time (midnight UTC)
	const utcToday = Date.UTC(
		today.getFullYear(),
		today.getMonth(),
		today.getDate()
	);
	const utcCreatedDate = Date.UTC(
		createdDate.getFullYear(),
		createdDate.getMonth(),
		createdDate.getDate()
	);

	const differenceMs = utcToday - utcCreatedDate;
	const days = Math.floor(differenceMs / (1000 * 60 * 60 * 24)); // Convert milliseconds to full days
	return (
		<div className="rounded-2xl p-[1px] bg-gradient-to-r from-red-400 via-green-500 to-blue-400">
			<Card className="w-full rounded-2xl bg-white dark:bg-black">
				<CardHeader>
					<div className="flex justify-between items-baseline text-[#C62828] font-bold text-lg">
						<CardTitle className="text-xl font-bold">{status}</CardTitle>
						<CardDescription className="text-[#C62828] text-lg ml-2">
							({days} days)
						</CardDescription>
					</div>
					<div className="grid grid-cols-2 gap-x-4 text-sm">
						<div className="font-semibold">{technician}</div>
						<div className="text-right">{date}</div>
						<div className="font-semibold">{serialNo}</div>
						<div className="text-right">{model}</div>
					</div>
				</CardHeader>
				<CardContent className="pt-0 space-y-2 bg-muted rounded-2xl p-3 mx-3">
					<div>{client}</div>
					<div className="grid grid-cols-2 gap-4">
						<div>{location}</div>
						<div>{department}</div>
					</div>
					<div>{notes || "Notes not provided"}</div>
				</CardContent>
			</Card>
		</div>
	);
}
