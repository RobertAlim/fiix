// components/printer-status-card.tsx
"use client";

import React, { useEffect, useState } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Printer } from "@/components/columns/printers/columns";
import { showAppToast } from "./ui/apptoast";
import { cn } from "@/lib/utils";

export function PrinterStatusCard({
	id,
	department,
	model,
	serialNo,
	status,
	notes,
	lastMt,
	mtId,
	schedDetailsId,
	isMaintained,
	maintainedDate,
	isToggled: initialToggle,
	onToggleChange,
}: Printer) {
	const [localToggle, setLocalToggle] = useState<boolean>(initialToggle);

	useEffect(() => {
		setLocalToggle(initialToggle);
	}, [initialToggle]);

	const handleToggle = () => {
		if (isMaintained) {
			showAppToast({
				message: "Maintenance Done",
				description: "This printer is already maintained.",
				color: "warning",
				position: "top-right",
			});
			return;
		}

		setLocalToggle((prev) => {
			const next = !prev;
			queueMicrotask(() => onToggleChange(next));
			return next;
		});
	};

	const badgeClass =
		status === "Good Condition"
			? "bg-success text-success-foreground"
			: status === "Pulled Out"
			? "bg-info text-info-foreground"
			: status === null
			? ""
			: "bg-destructive text-white";

	const issueBoxClass =
		status === "Good Condition"
			? "bg-success/10 border-success/30"
			: status === "Pulled Out"
			? "bg-info/10 border-info/30"
			: "bg-destructive/10 border-destructive/30";

	const issueTextClass =
		status === "Good Condition"
			? "text-success"
			: status === "Pulled Out"
			? "text-info"
			: "text-destructive";

	return (
		<Card
			className={cn(
				"w-full rounded-xl border transition-colors duration-200 cursor-pointer hover:shadow-sm",
				localToggle ? "bg-success/10 border-success/40" : "bg-card"
			)}
			onClick={() => handleToggle()}
		>
			<CardHeader>
				<div className="flex justify-between items-center">
					<CardTitle className="text-lg font-bold">
						<span className="inline sm:hidden md:inline lg:hidden">#: </span>
						<span className="hidden sm:inline md:hidden lg:inline">
							Printer:{" "}
						</span>
						{id}
					</CardTitle>

					<Badge
						variant={status === null ? "outline" : "default"}
						className={cn("px-3 py-1 text-sm font-semibold rounded-full", badgeClass)}
					>
						<span className="hidden sm:inline lg:inline">
							{status === null ? "New Unit" : status}
						</span>
						<span className="sm:hidden lg:hidden">
							{status === null
								? "NEW"
								: status === "Good Condition"
								? "RM"
								: status === "Pulled Out"
								? "PO"
								: status === "Replacement (Unit)"
								? "RU"
								: "RP"}
						</span>
					</Badge>
				</div>
				<CardDescription className="text-sm text-muted-foreground">
					Serial No: {serialNo}
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-4">
				<div className="flex items-center space-x-4 p-2 rounded-md">
					<div className="flex-1 space-y-1">
						<p className="text-sm font-medium leading-none text-muted-foreground">
							Model
						</p>
						<p className="text-md font-semibold">{model}</p>
					</div>
					<Separator orientation="vertical" className="h-10" />
					<div className="flex-1 space-y-1 text-right">
						<p className="text-sm font-medium leading-none text-muted-foreground">
							Department
						</p>
						<p className="text-md font-semibold">{department}</p>
					</div>
				</div>

				<Separator />

				<div className="grid grid-cols-2 gap-4">
					<div>
						<p className="text-sm font-medium text-muted-foreground">
							Last Maintenance
						</p>
						<p className="text-md font-semibold">
							{lastMt !== null ? format(lastMt, "MM/dd h:mm aa") : ""}
						</p>
					</div>
					<div>
						<p className="text-sm font-medium text-muted-foreground">
							Maintenance ID
						</p>
						<p className="text-md font-semibold">{mtId}</p>
					</div>
				</div>

				<div className="grid grid-cols-2 gap-4">
					<div>
						<p className="text-sm font-medium text-muted-foreground">
							Maintained Date
						</p>
						<p className="text-md font-semibold">
							{maintainedDate !== null
								? format(maintainedDate, "MM/dd h:mm aa")
								: ""}
						</p>
					</div>
					<div>
						<p className="text-sm font-medium text-muted-foreground">
							Sched Details ID
						</p>
						<p className="text-md font-semibold">
							{schedDetailsId || "Not Scheduled"}
						</p>
					</div>
				</div>

				<div className={cn("mt-2 p-3 border rounded-md", issueBoxClass)}>
					<p className={cn("text-sm font-medium", issueTextClass)}>
						Current Issue:
					</p>
					<p className={cn("text-md font-semibold", issueTextClass)}>{notes}</p>
				</div>
			</CardContent>
		</Card>
	);
}
