"use client";

// components/UnmaintainedPrintersPanel.tsx
//
// Replaces the old itinerary-based "Missed Schedules" card on the Schedule
// page (see components/pages/Schedule.tsx). Purely maintenance-date-driven:
// backed by GET /api/unmaintained-printers, which already filters to 7+
// days since a printer's last maintenance record (or since deployment, if
// it's never been maintained at all) and sorts longest-overdue first — this
// component just renders what that route returns, with no client-side
// filtering/sorting of its own, so there's exactly one place the "7 days"
// and "longest first" rules live.
import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock3, ChevronDown, CalendarPlus } from "lucide-react";
import { fetchData } from "@/lib/fetchData";
import {
	AssignScheduleModal,
	type AssignTarget,
	type Technician,
	type Priority,
} from "@/components/pages/PendingMaintenancePanel";
import { PrinterHistoryDialog } from "@/components/PrinterHistoryDialog";

interface UnmaintainedPrinter {
	printerId: number;
	serialNo: string;
	model: string | null;
	clientId: number;
	client: string;
	locationId: number;
	location: string;
	lastMaintainedAt: string | null;
	daysSinceMaintenance: number;
}

export function UnmaintainedPrintersPanel() {
	const queryClient = useQueryClient();
	// Collapsed by default, per-session only — same reasoning as the old
	// Missed Schedules card: this list can run to several rows and
	// shouldn't push the rest of the Schedule page down before someone's
	// actually decided to look at it.
	const [isOpen, setIsOpen] = useState(false);
	const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);
	const [historyPrinterId, setHistoryPrinterId] = useState<number | null>(null);

	const { data: printers = [], isLoading } = useQuery<UnmaintainedPrinter[]>({
		queryKey: ["unmaintained-printers"],
		queryFn: () => fetchData<UnmaintainedPrinter[]>("/api/unmaintained-printers"),
		staleTime: 1000 * 60,
		// "Continuously update" per the request — a printer drops off this
		// list the moment a new report is filed for it, so a modest
		// background refetch keeps a Scheduler's open tab from showing a
		// printer as overdue for long after someone's already handled it.
		refetchInterval: 1000 * 60 * 5,
	});

	const { data: technicians = [] } = useQuery<Technician[]>({
		queryKey: ["technicians"],
		queryFn: () => fetchData<Technician[]>("/api/technicians"),
		staleTime: 1000 * 60 * 5,
	});

	const { data: priorities = [] } = useQuery<Priority[]>({
		queryKey: ["priorities"],
		queryFn: () => fetchData<Priority[]>("/api/priorities"),
		staleTime: 1000 * 60 * 5,
	});

	if (isLoading || printers.length === 0) return null;

	return (
		<Card className="rounded-2xl border border-destructive/40 shadow-sm">
			<CardHeader
				className="flex flex-row cursor-pointer items-center justify-between space-y-0"
				onClick={() => setIsOpen((open) => !open)}
				role="button"
				tabIndex={0}
				aria-expanded={isOpen}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						setIsOpen((open) => !open);
					}
				}}
			>
				<div>
					<CardTitle className="flex items-center gap-2 text-base font-semibold">
						<AlertTriangle className="h-5 w-5 text-destructive" />
						Unmaintained Printers
					</CardTitle>
					<p className="text-sm text-muted-foreground">
						Deployed printers with no maintenance visit in 7+ days, longest
						overdue first. A printer drops off this list automatically the
						moment a new report is filed for it.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Badge variant="destructive">{printers.length} overdue</Badge>
					<ChevronDown
						className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
							isOpen ? "rotate-180" : ""
						}`}
					/>
				</div>
			</CardHeader>
			{isOpen && (
				<CardContent>
					{/* No scroll cap of its own — this panel, Pending Maintenance,
					    and the Schedule workflow below all share ONE scroll
					    container (the ScrollArea wrapping the whole page in
					    components/pages/Schedule.tsx). A second, capped
					    ScrollArea nested in here would clip its own content
					    instead of scrolling it. */}
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
						{printers.map((p) => (
							<Card
								key={p.printerId}
								className="cursor-pointer rounded-xl border shadow-none transition-shadow hover:shadow-sm"
								onClick={() => setHistoryPrinterId(p.printerId)}
							>
								<CardContent className="space-y-3 p-4">
									<div className="flex items-start justify-between gap-2">
										<div>
											<p className="font-semibold leading-tight">
												{p.serialNo}
											</p>
											<p className="text-xs text-muted-foreground">
												{p.model ?? "—"}
											</p>
										</div>
										<Badge
											variant="destructive"
											className="shrink-0 gap-1 whitespace-nowrap"
										>
											<Clock3 className="h-3 w-3" />
											{p.daysSinceMaintenance}d
										</Badge>
									</div>

									<div className="text-sm">
										<p className="font-medium">{p.client}</p>
										<p className="text-muted-foreground">{p.location}</p>
									</div>

									<p className="text-xs text-muted-foreground">
										{p.lastMaintainedAt
											? `Last maintained ${new Date(
													p.lastMaintainedAt
											  ).toLocaleDateString("en-US", {
													timeZone: "Asia/Manila",
													month: "short",
													day: "numeric",
													year: "numeric",
											  })}`
											: "Never maintained since deployment"}
									</p>

									<div className="flex justify-end pt-1">
										<Button
											size="sm"
											onClick={(e) => {
												e.stopPropagation();
												setAssignTarget({
													// No originating maintain record — this is a
													// forward-looking "please visit this printer"
													// schedule, not tied to any specific report.
													maintainId: null,
													printerId: p.printerId,
													serialNo: p.serialNo,
													model: p.model,
													clientId: p.clientId,
													locationId: p.locationId,
													client: p.client,
													location: p.location,
												});
										}}
										>
											<CalendarPlus className="h-4 w-4" />
											Schedule
										</Button>
									</div>
								</CardContent>
							</Card>
						))}
					</div>
				</CardContent>
			)}

			<AssignScheduleModal
				item={assignTarget}
				technicians={technicians}
				priorities={priorities}
				onClose={() => setAssignTarget(null)}
				onAssigned={() => {
					queryClient.invalidateQueries({ queryKey: ["unmaintained-printers"] });
					queryClient.invalidateQueries({ queryKey: ["pending-maintenance"] });
					queryClient.invalidateQueries({ queryKey: ["printers"] });
					queryClient.invalidateQueries({ queryKey: ["schedules"] });
					setAssignTarget(null);
				}}
			/>

			<PrinterHistoryDialog
				printerId={historyPrinterId}
				onOpenChange={(open) => {
					if (!open) setHistoryPrinterId(null);
				}}
			/>
		</Card>
	);
}
