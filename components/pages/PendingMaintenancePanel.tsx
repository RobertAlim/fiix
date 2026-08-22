"use client";

import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { ComboBoxResponsive, ComboboxItem } from "@/components/ui/combobox";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import {
	AlertTriangle,
	CalendarCheck2,
	Clock3,
	CheckCircle2,
	Bell,
	ChevronDown,
} from "lucide-react";
import { fetchData } from "@/lib/fetchData";
import { showAppToast } from "@/components/ui/apptoast";
import { apiPath } from "@/lib/base-path";
import { useUserStore } from "@/state/userStore";
import { PrinterHistoryDialog } from "@/components/PrinterHistoryDialog";

interface PendingMaintenanceItem {
	id: number; // maintain.id
	printerId: number;
	serialNo: string;
	clientId: number;
	client: string;
	locationId: number;
	location: string;
	department: string;
	model: string;
	status: string;
	notes: string | null;
	createdAt: string;
	isScheduled: boolean;
	scheduledDate: string | null;
	scheduledTechnicianName: string | null;
}

export interface Technician {
	id: string;
	name: string;
}

export interface Priority {
	id: string;
	name: string;
}

export interface AssignTarget {
	maintainId: number | null;
	printerId: number;
	serialNo: string;
	model: string | null;
	clientId: number;
	client: string;
	locationId: number;
	location: string;
}

function daysSince(dateStr: string): number {
	const created = new Date(dateStr);
	const diffMs = Date.now() - created.getTime();
	return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export default function PendingMaintenancePanel({
	readOnly = false,
}: {
	/**
	 * View-only mode — hides the Resolve action while leaving everything
	 * else (including Assign) as-is. Used on the Schedule page, where this
	 * panel is embedded alongside the itinerary tools; the Resolve action
	 * stays exclusive to the standalone Pending Maintenance nav page (see
	 * components/pages/PendingMaintenance.tsx, which renders this same
	 * component WITHOUT readOnly).
	 */
	readOnly?: boolean;
}) {
	const queryClient = useQueryClient();
	const { users } = useUserStore();
	// Role implication means a Super Admin also sees this — see
	// lib/permissions.ts's effectiveRoles/ROLE_IMPLIES.
	const canResolve =
		!readOnly && (users?.role === "Admin" || users?.role === "Super Admin");
	const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);
	const [resolveTarget, setResolveTarget] = useState<PendingMaintenanceItem | null>(
		null
	);
	const [historyPrinterId, setHistoryPrinterId] = useState<number | null>(null);
	// Starts expanded — unlike Unmaintained Printers (which defaults
	// collapsed since it's a newer, secondary list), Pending Maintenance
	// is this panel's primary purpose on both pages it appears on.
	const [isOpen, setIsOpen] = useState(true);

	const { data: pendingItems = [], isLoading } = useQuery<PendingMaintenanceItem[]>({
		queryKey: ["pending-maintenance"],
		queryFn: () => fetchData<PendingMaintenanceItem[]>("/api/pending-maintenance"),
		staleTime: 1000 * 60,
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

	const unscheduled = pendingItems.filter((i) => !i.isScheduled);

	if (isLoading) {
		return (
			<Card className="rounded-2xl border shadow-sm">
				<CardContent className="p-6 text-sm text-muted-foreground">
					Loading pending maintenance…
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="space-y-4">
		<Card className="rounded-2xl border shadow-sm">
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
					<CardTitle className="text-base font-semibold">
						Pending Maintenance
					</CardTitle>
					<p className="text-sm text-muted-foreground">
						Printers awaiting a technician — assign a schedule before creating
						new ones.
					</p>
				</div>
				<div className="flex items-center gap-2">
					{/* Bell — matches the topbar notification icon
					    (components/OpenIssuesBell.tsx), since this badge is the
					    same "how many need attention" concept applied to one
					    section instead of the whole app. */}
					<Badge className="gap-1 bg-warning text-warning-foreground">
						<Bell className="h-3 w-3" />
						{unscheduled.length} Pending
					</Badge>
					<ChevronDown
						className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
							isOpen ? "rotate-180" : ""
						}`}
					/>
				</div>
			</CardHeader>
			{isOpen && (
			<CardContent>
				{pendingItems.length === 0 ? (
					<p className="py-6 text-center text-sm text-muted-foreground">
						No outstanding maintenance requests. 🎉
					</p>
				) : (
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
						{pendingItems.map((item) => (
							<Card
								key={item.id}
								className="cursor-pointer rounded-xl border shadow-none hover:shadow-sm transition-shadow"
								onClick={() => setHistoryPrinterId(item.printerId)}
							>
								<CardContent className="space-y-3 p-4">
									<div className="flex items-start justify-between gap-2">
										<div>
											<p className="font-semibold leading-tight">
												{item.serialNo}
											</p>
											<p className="text-xs text-muted-foreground">
												{item.model} · {item.department}
											</p>
										</div>
										<Badge
											variant="destructive"
											className="shrink-0 gap-1 whitespace-nowrap"
										>
											<AlertTriangle className="h-3 w-3" />
											{item.status}
										</Badge>
									</div>

									<div className="text-sm">
										<p className="font-medium">{item.client}</p>
										<p className="text-muted-foreground">{item.location}</p>
									</div>

									{item.notes && (
										<p className="line-clamp-2 rounded-lg bg-muted p-2 text-xs text-muted-foreground">
											{item.notes}
										</p>
									)}

									<div className="flex items-center justify-between pt-1">
										<span className="flex items-center gap-1 text-xs text-muted-foreground">
											<Clock3 className="h-3 w-3" />
											{daysSince(item.createdAt)}d open
										</span>

										<div className="flex items-center gap-2">
											{item.isScheduled && (
												<Badge className="gap-1 bg-info text-info-foreground">
													<CalendarCheck2 className="h-3 w-3" />
													Scheduled
													{item.scheduledTechnicianName
														? ` · ${item.scheduledTechnicianName}`
														: ""}
												</Badge>
											)}

											{!item.isScheduled && (
												<Button
													size="sm"
													onClick={(e) => {
														e.stopPropagation();
														setAssignTarget({
															maintainId: item.id,
															printerId: item.printerId,
															serialNo: item.serialNo,
															model: item.model,
															clientId: item.clientId,
															client: item.client,
															locationId: item.locationId,
															location: item.location,
														});
													}}
												>
													Assign
												</Button>
											)}
											{/* Label is "Resolve" (an action), not "Resolved" (a
											    state) — every item that reaches this list is, by
											    construction, still pending: see the GET route's
											    doc comment. Hidden entirely in readOnly mode (the
											    Schedule page's copy of this panel) — see this
											    component's own doc comment above. */}
											{canResolve && (
												<Button
													size="sm"
													variant="outline"
													onClick={(e) => {
														e.stopPropagation();
														setResolveTarget(item);
													}}
												>
													<CheckCircle2 className="h-4 w-4" />
													Resolve
												</Button>
											)}
										</div>
									</div>
								</CardContent>
							</Card>
						))}
					</div>
				)}
			</CardContent>
			)}

			<AssignScheduleModal
				item={assignTarget}
				technicians={technicians}
				priorities={priorities}
				onClose={() => setAssignTarget(null)}
				onAssigned={() => {
					queryClient.invalidateQueries({ queryKey: ["pending-maintenance"] });
					queryClient.invalidateQueries({ queryKey: ["unmaintained-printers"] });
					queryClient.invalidateQueries({ queryKey: ["openIssues"] });
					queryClient.invalidateQueries({ queryKey: ["printers"] });
					queryClient.invalidateQueries({ queryKey: ["schedules"] });
					setAssignTarget(null);
				}}
			/>

			{!readOnly && (
				<ResolveDialog
					item={resolveTarget}
					onClose={() => setResolveTarget(null)}
					onResolved={() => {
						queryClient.invalidateQueries({ queryKey: ["pending-maintenance"] });
						setResolveTarget(null);
					}}
				/>
			)}
		</Card>

		<PrinterHistoryDialog
			printerId={historyPrinterId}
			onOpenChange={(open) => {
				if (!open) setHistoryPrinterId(null);
			}}
		/>
		</div>
	);
}

function ResolveDialog({
	item,
	onClose,
	onResolved,
}: {
	item: PendingMaintenanceItem | null;
	onClose: () => void;
	onResolved: () => void;
}) {
	const [notes, setNotes] = useState("");
	const { mutate, isPending } = useMutation({
		mutationFn: async () => {
			if (!item) return;
			const res = await fetch(
				apiPath(`/api/pending-maintenance/${item.id}/resolve`),
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ notes }),
				}
			);
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error || "Failed to resolve this item.");
			}
			return res.json();
		},
		onSuccess: () => {
			showAppToast({
				message: "Marked resolved",
				position: "top-right",
				color: "success",
			});
			setNotes("");
			onResolved();
		},
		onError: (error: Error) => {
			showAppToast({
				message: "Failed to resolve",
				description: error.message,
				position: "top-right",
				color: "error",
			});
		},
	});

	return (
		<Dialog
			open={!!item}
			onOpenChange={(open) => {
				if (!open) {
					setNotes("");
					onClose();
				}
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Resolve Pending Maintenance</DialogTitle>
					<DialogDescription>
						{item
							? `${item.serialNo} — ${item.client} · ${item.location}`
							: ""}{" "}
						This sets the maintenance status to Resolved and records who
						resolved it, when, and why. It moves off this list once saved.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-2 py-2">
					<label className="text-sm font-medium">Resolution notes</label>
					<Textarea
						value={notes}
						onChange={(e) => setNotes(e.target.value)}
						placeholder="What was done to resolve this?"
						rows={4}
					/>
				</div>
				<DialogFooter>
					<Button
						onClick={() => mutate()}
						disabled={isPending || notes.trim().length === 0}
					>
						{isPending ? "Saving…" : "Resolve"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function AssignScheduleModal({
	item,
	technicians,
	priorities,
	onClose,
	onAssigned,
}: {
	item: AssignTarget | null;
	technicians: Technician[];
	priorities: Priority[];
	onClose: () => void;
	onAssigned: () => void;
}) {
	const [technicianId, setTechnicianId] = useState<string | null>(null);
	const [priorityId, setPriorityId] = useState<string | null>(null);
	const [scheduleDate, setScheduleDate] = useState<Date | undefined>(undefined);
	const [notes, setNotes] = useState("");

	React.useEffect(() => {
		if (!item) return;
		setTechnicianId(null);
		setPriorityId(null);
		setNotes("");
		setScheduleDate(undefined);
	}, [item]);

	const technicianOptions: ComboboxItem[] = technicians.map((t) => ({
		value: String(t.id),
		label: t.name,
	}));
	const priorityOptions: ComboboxItem[] = priorities.map((p) => ({
		value: String(p.id),
		label: p.name,
	}));

	const { mutate, isPending } = useMutation({
		mutationFn: async () => {
			if (!item || !technicianId || !priorityId || !scheduleDate) {
				throw new Error("Missing required fields");
			}
			const res = await fetch(apiPath("/api/schedule/assign"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					maintainId: item.maintainId,
					printerId: item.printerId,
					technicianId: Number(technicianId),
					clientId: item.clientId,
					locationId: item.locationId,
					priority: Number(priorityId),
					notes,
					scheduleDate: format(scheduleDate, "yyyy-MM-dd"),
				}),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error || "Failed to create schedule.");
			}
			return res.json();
		},
		onSuccess: () => {
			showAppToast({
				message: "Schedule created",
				description: `${item?.serialNo} has been assigned.`,
				position: "top-right",
				color: "success",
			});
			resetForm();
			onAssigned();
		},
		onError: (error: Error) => {
			showAppToast({
				message: "Failed to create schedule",
				description: error.message,
				position: "top-right",
				color: "error",
			});
		},
	});

	const resetForm = () => {
		setTechnicianId(null);
		setPriorityId(null);
		setScheduleDate(undefined);
		setNotes("");
	};

	const canSubmit = !!technicianId && !!priorityId && !!scheduleDate && !isPending;

	return (
		<Dialog
			open={!!item}
			onOpenChange={(open) => {
				if (!open) {
					resetForm();
					onClose();
				}
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Assign Schedule</DialogTitle>
					<DialogDescription>
						Complete the details below to schedule this maintenance request.
					</DialogDescription>
				</DialogHeader>

				{item && (
					<div className="grid gap-4 py-2">
						<div className="grid grid-cols-2 gap-3 rounded-xl bg-muted p-3 text-sm">
							<div>
								<p className="text-xs text-muted-foreground">Client</p>
								<p className="font-medium">{item.client}</p>
							</div>
							<div>
								<p className="text-xs text-muted-foreground">Location</p>
								<p className="font-medium">{item.location}</p>
							</div>
							<div className="col-span-2">
								<p className="text-xs text-muted-foreground">Printer</p>
								<p className="font-medium">
									{item.serialNo} — {item.model}
								</p>
							</div>
						</div>

						<div className="space-y-2">
							<label className="text-sm font-medium">Technician *</label>
							<ComboBoxResponsive
								data={technicianOptions}
								placeholder="Select technician"
								selectedValue={technicianId}
								onValueChange={setTechnicianId}
								emptyMessage="No technician found."
							/>
						</div>

						<div className="space-y-2">
							<label className="text-sm font-medium">Schedule Date *</label>
							{/* Scheduling looks forward: today and any future date are
							    valid, past dates are not. */}
							<DatePicker
								onDateSelect={setScheduleDate}
								selectedDate={scheduleDate}
								allowFutureDates
								minDate={new Date()}
							/>
						</div>

						<div className="space-y-2">
							<label className="text-sm font-medium">Priority *</label>
							<ComboBoxResponsive
								data={priorityOptions}
								placeholder="Select priority"
								selectedValue={priorityId}
								onValueChange={setPriorityId}
								emptyMessage="No priority found."
							/>
						</div>

						<div className="space-y-2">
							<label className="text-sm font-medium">Notes</label>
							<Textarea
								placeholder="Add any notes for the technician"
								value={notes}
								onChange={(e) => setNotes(e.target.value)}
							/>
						</div>
					</div>
				)}

				<DialogFooter>
					<Button
						onClick={() => mutate()}
						disabled={!canSubmit}
					>
						{isPending ? "Assigning…" : "Create Schedule"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
