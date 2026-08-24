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
import { UserRoundX } from "lucide-react";

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
	assignedTechnicianName,
}: Printer) {
	const [localToggle, setLocalToggle] = useState<boolean>(initialToggle);

	useEffect(() => {
		setLocalToggle(initialToggle);
	}, [initialToggle]);

	// Same guard pattern as isMaintained below: a printer already on ANOTHER
	// technician's schedule for this date can't also be toggled onto this
	// one — the backend (app/api/schedule/route.ts) would reject it at save
	// time anyway, this just surfaces that up front instead of after a
	// failed save.
	const isAssignedElsewhere = !!assignedTechnicianName;

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

		if (isAssignedElsewhere) {
			showAppToast({
				message: "Already Assigned",
				description: `This printer is already assigned to ${assignedTechnicianName} for this date.`,
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
				"w-full rounded-xl border transition-colors duration-200 hover:shadow-sm",
				isAssignedElsewhere
					? "cursor-not-allowed bg-muted/40 opacity-75"
					: "cursor-pointer",
				!isAssignedElsewhere && localToggle
					? "bg-success/10 border-success/40"
					: !isAssignedElsewhere
					? "bg-card"
					: undefined
			)}
			onClick={() => handleToggle()}
			title={
				isAssignedElsewhere
					? `Already assigned to ${assignedTechnicianName}`
					: undefined
			}
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
				{isAssignedElsewhere && (
					<Badge
						variant="outline"
						className="mt-2 flex w-fit items-center gap-1 border-warning/40 bg-warning/10 px-2 py-1 text-xs font-medium text-warning-foreground"
					>
						<UserRoundX className="h-3 w-3" />
						Assigned to {assignedTechnicianName}
					</Badge>
				)}
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
