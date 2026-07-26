// components/OpenIssueComponent.tsx
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
	notes?: string;
}

export function OpenIssueComponent({
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
	const createdDate = new Date(date);

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
	const days = Math.floor(differenceMs / (1000 * 60 * 60 * 24));

	return (
		<Card className="w-full rounded-xl border shadow-none hover:shadow-sm transition-shadow">
			<CardHeader className="pb-2">
				<div className="flex justify-between items-baseline gap-2">
					<CardTitle className="text-base font-bold text-destructive">
						{status}
					</CardTitle>
					<Badge variant="destructive" className="shrink-0">
						{days}d open
					</Badge>
				</div>
				<div className="grid grid-cols-2 gap-x-4 text-sm text-muted-foreground">
					<div className="font-medium text-foreground">{technician}</div>
					<div className="text-right">{date}</div>
					<div className="font-medium text-foreground">{serialNo}</div>
					<div className="text-right">{model}</div>
				</div>
			</CardHeader>
			<CardContent className="pt-0 space-y-2 bg-muted rounded-xl p-3 mx-3 mb-3">
				<div className="font-medium">{client}</div>
				<div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
					<div>{location}</div>
					<div>{department}</div>
				</div>
				<div className="text-sm">{notes || "Notes not provided"}</div>
			</CardContent>
		</Card>
	);
}
