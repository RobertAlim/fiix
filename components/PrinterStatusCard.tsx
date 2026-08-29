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

// Which color theme each maintenance status gets on this card's badge and
// "Current Issue" box. Previously this was a 3-way ternary (Good
// Condition -> green, Pulled Out -> blue, EVERYTHING else -> red) — that
// catch-all is why "Resolved" (a real status set by the Pending
// Maintenance "Resolve" action, see app/api/pending-maintenance/[id]/
// resolve/route.ts) rendered as a red badge instead of green: it was
// never a recognized value, so it fell through to the red default along
// with every other unrecognized status. Listed explicitly and matched
// case-insensitively so new status names added later default to neutral
// (see FALLBACK below) instead of silently reading as an error state.
const RED_STATUSES = new Set(
	["Pulled Out", "For Replacement (Printer Part)", "For Replacement of Printer"].map(
		(s) => s.toLowerCase()
	)
);
const BLUE_STATUSES = new Set(
	["Change Unit", "Refill Ink", "For Reset"].map((s) => s.toLowerCase())
);
const GREEN_STATUSES = new Set(
	["Good Condition", "Resolved"].map((s) => s.toLowerCase())
);

type StatusTheme = "red" | "blue" | "green" | "neutral";

// Small-screen abbreviation for the badge (the layout swaps to this on
// narrow viewports — see the two <span>s below). Previously a ternary
// chain that only recognized "Good Condition" and "Pulled Out" by name,
// with "Replacement (Unit)" as a third case and EVERYTHING else —
// including "Resolved" — defaulting to "RP", which read as "Replacement
// Part" for statuses that were nothing of the kind. Listed explicitly,
// same as the color theme above, with a safe generic fallback instead of
// a specific-but-wrong label for anything not in the list.
const STATUS_ABBR: Record<string, string> = {
	"good condition": "RM",
	"pulled out": "PO",
	"replacement (unit)": "RU",
	"for replacement (printer part)": "RP",
	"for replacement of printer": "RP",
	"change unit": "CU",
	"refill ink": "RI",
	"for reset": "FR",
	resolved: "RS",
};

function getStatusAbbreviation(status: string | null): string {
	if (!status) return "NEW";
	const normalized = status.trim().toLowerCase();
	return STATUS_ABBR[normalized] ?? "•";
}

function getStatusTheme(status: string | null): StatusTheme {
	const normalized = status?.trim().toLowerCase();
	if (!normalized) return "neutral";
	if (GREEN_STATUSES.has(normalized)) return "green";
	if (BLUE_STATUSES.has(normalized)) return "blue";
	if (RED_STATUSES.has(normalized)) return "red";
	// A status not in any list above (a new one added in the database
	// that this card doesn't know about yet) — neutral rather than
	// silently red, since red should mean "needs attention," not
	// "unrecognized."
	return "neutral";
}

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
	readOnly,
}: Printer & {
	/** True when the schedule this printer belongs to is dated before
	 * today — adding/removing printers is an edit like any other and stays
	 * blocked for a past date, same reasoning as everywhere else on the
	 * Schedule page. Not part of the `Printer` type itself (that's fetched
	 * data / diffing shape), so this is a separate prop passed alongside
	 * the spread `{...printer}`, the same way `onToggleChange` already is. */
	readOnly?: boolean;
}) {
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
		if (readOnly) {
			showAppToast({
				message: "This schedule can no longer be edited",
				description: "Its date has already passed.",
				color: "warning",
				position: "top-right",
			});
			return;
		}

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

	const statusTheme = getStatusTheme(status);

	const badgeClass =
		statusTheme === "green"
			? "bg-success text-success-foreground"
			: statusTheme === "blue"
			? "bg-info text-info-foreground"
			: statusTheme === "red"
			? "bg-destructive text-white"
			: // "neutral": either no status yet (New Unit) or a status this
			  // card doesn't have a color for — no color is applied either
			  // way, matching the previous New Unit treatment.
			  "";

	const issueBoxClass =
		statusTheme === "green"
			? "bg-success/10 border-success/30"
			: statusTheme === "blue"
			? "bg-info/10 border-info/30"
			: statusTheme === "red"
			? "bg-destructive/10 border-destructive/30"
			: "bg-muted border-muted-foreground/20";

	const issueTextClass =
		statusTheme === "green"
			? "text-success"
			: statusTheme === "blue"
			? "text-info"
			: statusTheme === "red"
			? "text-destructive"
			: "text-muted-foreground";

	return (
		<Card
			className={cn(
				"w-full rounded-xl border transition-colors duration-200",
				!readOnly && "hover:shadow-sm",
				isAssignedElsewhere
					? "cursor-not-allowed bg-muted/40 opacity-75"
					: readOnly
						? "cursor-default"
						: "cursor-pointer",
				// Read-only still shows whether this printer was part of the
				// schedule (the point of viewing it), just without the
				// hover/click affordance of an editable card.
				!isAssignedElsewhere && localToggle
					? "bg-success/10 border-success/40"
					: !isAssignedElsewhere
						? "bg-card"
						: undefined
			)}
			onClick={() => handleToggle()}
			title={
				readOnly
					? "This schedule's date has already passed — read only."
					: isAssignedElsewhere
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
							{getStatusAbbreviation(status)}
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
