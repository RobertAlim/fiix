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
	CalendarX2,
	UserCog,
	ChevronDown,
	CheckCircle2,
	History,
} from "lucide-react";
import { fetchData } from "@/lib/fetchData";
import { showAppToast } from "@/components/ui/apptoast";
import { apiPath } from "@/lib/base-path";
import { useUserStore } from "@/state/userStore";

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
	isResolved: boolean;
	resolvedAt: string | null;
	resolutionNotes: string | null;
	resolvedByName: string | null;
}

/** A schedule whose date has passed with the work never marked done. */
interface MissedScheduleItem {
	scheduleDetailsId: number;
	scheduleId: number;
	originMTId: number | null;
	printerId: number;
	serialNo: string;
	model: string | null;
	department: string | null;
	clientId: number;
	client: string;
	locationId: number;
	location: string;
	technicianId: number;
	technician: string;
	priorityId: number | null;
	priority: string | null;
	notes: string | null;
	scheduledAt: string;
	scheduledDate: string;
	daysOverdue: number;
}

interface Technician {
	id: string;
	name: string;
}

interface Priority {
	id: string;
	name: string;
}

/**
 * Both flows end up creating a schedule through the same endpoint, so the two
 * card types are normalized into this shape before the modal sees them. The
 * only real differences are the wording and whether the technician/priority
 * start pre-filled.
 */
interface AssignTarget {
	mode: "assign" | "reschedule";
	maintainId: number | null;
	printerId: number;
	serialNo: string;
	model: string | null;
	clientId: number;
	client: string;
	locationId: number;
	location: string;
	/** Pre-selected in reschedule mode — "keep the same technician" is the
	 * common case, and reassigning is just changing the dropdown. */
	defaultTechnicianId?: string | null;
	defaultPriorityId?: string | null;
	defaultNotes?: string;
	missedOn?: string;
	daysOverdue?: number;
	/** Reschedule mode only: the missed schedule being replaced. Sent to the
	 * server as a back-pointer so the original stays on record as missed and
	 * the two rows remain linked for audit. */
	rescheduledFromScheduleId?: number;
}

function daysSince(dateStr: string): number {
	const created = new Date(dateStr);
	const diffMs = Date.now() - created.getTime();
	return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export default function PendingMaintenancePanel() {
	const queryClient = useQueryClient();
	const { users } = useUserStore();
	// Role implication means a Super Admin also sees this — see
	// lib/permissions.ts's effectiveRoles/ROLE_IMPLIES.
	const canResolve = users?.role === "Admin" || users?.role === "Super Admin";
	const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);
	const [resolveTarget, setResolveTarget] = useState<PendingMaintenanceItem | null>(
		null
	);
	// Collapsed by default — the Missed Schedules grid can run to several
	// rows and was pushing the rest of the Schedule page down before a user
	// had even decided they needed to look at it. Per-session only (not
	// persisted): opening it once to handle a backlog shouldn't leave it
	// permanently expanded on every future visit.
	const [isMissedOpen, setIsMissedOpen] = useState(false);

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

	const { data: missedSchedules = [] } = useQuery<MissedScheduleItem[]>({
		queryKey: ["missed-schedules"],
		queryFn: () => fetchData<MissedScheduleItem[]>("/api/missed-schedules"),
		staleTime: 1000 * 60,
	});

	const unscheduled = pendingItems.filter((i) => !i.isScheduled && !i.isResolved);

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
		{missedSchedules.length > 0 && (
			<Card className="rounded-2xl border border-destructive/40 shadow-sm">
				<CardHeader
					className="flex flex-row cursor-pointer items-center justify-between space-y-0"
					onClick={() => setIsMissedOpen((open) => !open)}
					role="button"
					tabIndex={0}
					aria-expanded={isMissedOpen}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							setIsMissedOpen((open) => !open);
						}
					}}
				>
					<div>
						<CardTitle className="flex items-center gap-2 text-base font-semibold">
							<CalendarX2 className="h-5 w-5 text-destructive" />
							Missed Schedules
						</CardTitle>
						<p className="text-sm text-muted-foreground">
							Scheduled visits that passed without being completed. Reschedule
							to put them back in a technician&apos;s itinerary.
						</p>
					</div>
					<div className="flex items-center gap-2">
						<Badge variant="destructive">{missedSchedules.length} missed</Badge>
						<ChevronDown
							className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
								isMissedOpen ? "rotate-180" : ""
							}`}
						/>
					</div>
				</CardHeader>
				{isMissedOpen && (
				<CardContent>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
						{missedSchedules.map((m) => (
							<Card
								key={m.scheduleDetailsId}
								className="rounded-xl border shadow-none transition-shadow hover:shadow-sm"
							>
								<CardContent className="space-y-3 p-4">
									<div className="flex items-start justify-between gap-2">
										<div>
											<p className="font-semibold leading-tight">{m.serialNo}</p>
											<p className="text-xs text-muted-foreground">
												{m.model ?? "—"}
												{m.department ? ` · ${m.department}` : ""}
											</p>
										</div>
										<Badge
											variant="destructive"
											className="shrink-0 gap-1 whitespace-nowrap"
										>
											<Clock3 className="h-3 w-3" />
											{m.daysOverdue}d overdue
										</Badge>
									</div>

									<div className="text-sm">
										<p className="font-medium">{m.client}</p>
										<p className="text-muted-foreground">{m.location}</p>
									</div>

									<div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-2 text-xs">
										<div>
											<p className="text-muted-foreground">Technician</p>
											<p className="font-medium">{m.technician}</p>
										</div>
										<div>
											<p className="text-muted-foreground">Scheduled</p>
											<p className="font-medium">{m.scheduledDate}</p>
										</div>
										{m.priority && (
											<div>
												<p className="text-muted-foreground">Priority</p>
												<p className="font-medium">{m.priority}</p>
											</div>
										)}
									</div>

									{m.notes && (
										<p className="line-clamp-2 text-xs text-muted-foreground">
											{m.notes}
										</p>
									)}

									<div className="flex justify-end pt-1">
										<Button
											size="sm"
											onClick={() =>
												setAssignTarget({
													mode: "reschedule",
													maintainId: m.originMTId,
													rescheduledFromScheduleId: m.scheduleId,
													printerId: m.printerId,
													serialNo: m.serialNo,
													model: m.model,
													clientId: m.clientId,
													client: m.client,
													locationId: m.locationId,
													location: m.location,
													defaultTechnicianId: String(m.technicianId),
													defaultPriorityId:
														m.priorityId != null ? String(m.priorityId) : null,
													defaultNotes: m.notes ?? "",
													missedOn: m.scheduledDate,
													daysOverdue: m.daysOverdue,
												})
											}
										>
											<UserCog className="h-4 w-4" />
											Reschedule
										</Button>
									</div>
								</CardContent>
							</Card>
						))}
					</div>
				</CardContent>
				)}
			</Card>
		)}

		<Card className="rounded-2xl border shadow-sm">
			<CardHeader className="flex flex-row items-center justify-between space-y-0">
				<div>
					<CardTitle className="text-base font-semibold">
						Pending Maintenance
					</CardTitle>
					<p className="text-sm text-muted-foreground">
						Printers awaiting a technician — assign a schedule before creating
						new ones.
					</p>
				</div>
				<Badge className="bg-warning text-warning-foreground">
					{unscheduled.length} outstanding
				</Badge>
			</CardHeader>
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
								className="rounded-xl border shadow-none hover:shadow-sm transition-shadow"
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

									{item.isResolved && (
										<div className="flex items-start gap-2 rounded-lg bg-success/10 p-2 text-xs text-success">
											<History className="mt-0.5 h-3.5 w-3.5 shrink-0" />
											<div className="min-w-0">
												<p className="font-medium">
													Resolved{item.resolvedByName ? ` by ${item.resolvedByName}` : ""}
													{item.resolvedAt
														? ` · ${new Date(item.resolvedAt).toLocaleString("en-US", {
																timeZone: "Asia/Manila",
																dateStyle: "medium",
																timeStyle: "short",
															})}`
														: ""}
												</p>
												{item.resolutionNotes && (
													<p className="text-success/80">{item.resolutionNotes}</p>
												)}
											</div>
										</div>
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

											{item.isResolved ? (
												<Badge className="gap-1 bg-success text-success-foreground">
													<CheckCircle2 className="h-3 w-3" />
													Resolved
												</Badge>
											) : (
												<>
													{!item.isScheduled && (
														<Button
															size="sm"
															onClick={() =>
																setAssignTarget({
																	mode: "assign",
																	maintainId: item.id,
																	printerId: item.printerId,
																	serialNo: item.serialNo,
																	model: item.model,
																	clientId: item.clientId,
																	client: item.client,
																	locationId: item.locationId,
																	location: item.location,
																})
															}
														>
															Assign
														</Button>
													)}
													{canResolve && (
														<Button
															size="sm"
															variant="outline"
															onClick={() => setResolveTarget(item)}
														>
															<CheckCircle2 className="h-4 w-4" />
															Resolved
														</Button>
													)}
												</>
											)}
										</div>
									</div>
								</CardContent>
							</Card>
						))}
					</div>
				)}
			</CardContent>

			<AssignScheduleModal
				item={assignTarget}
				technicians={technicians}
				priorities={priorities}
				onClose={() => setAssignTarget(null)}
				onAssigned={() => {
					queryClient.invalidateQueries({ queryKey: ["pending-maintenance"] });
					queryClient.invalidateQueries({ queryKey: ["missed-schedules"] });
					queryClient.invalidateQueries({ queryKey: ["openIssues"] });
					queryClient.invalidateQueries({ queryKey: ["printers"] });
					queryClient.invalidateQueries({ queryKey: ["schedules"] });
					setAssignTarget(null);
				}}
			/>

			<ResolveDialog
				item={resolveTarget}
				onClose={() => setResolveTarget(null)}
				onResolved={() => {
					queryClient.invalidateQueries({ queryKey: ["pending-maintenance"] });
					setResolveTarget(null);
				}}
			/>
		</Card>
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
						This records who resolved it, when, and why — the underlying
						maintenance report is not changed.
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
						{isPending ? "Saving…" : "Mark Resolved"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function AssignScheduleModal({
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

	const isReschedule = item?.mode === "reschedule";

	// Pre-fill from the missed schedule so "keep the same technician" needs no
	// interaction — the scheduler only has to pick a new date. Reassigning is
	// just changing the dropdown from here.
	React.useEffect(() => {
		if (!item) return;
		setTechnicianId(item.defaultTechnicianId ?? null);
		setPriorityId(item.defaultPriorityId ?? null);
		setNotes(item.defaultNotes ?? "");
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
					rescheduledFromScheduleId:
						item.rescheduledFromScheduleId ?? null,
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
				message: isReschedule ? "Schedule moved" : "Schedule created",
				description: isReschedule
					? `${item?.serialNo} has been rescheduled.`
					: `${item?.serialNo} has been assigned.`,
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
					<DialogTitle>
						{isReschedule ? "Reschedule Missed Visit" : "Assign Schedule"}
					</DialogTitle>
					<DialogDescription>
						{isReschedule
							? `Missed on ${item?.missedOn}. Pick a new date, and change the technician only if you're reassigning.`
							: "Complete the details below to schedule this maintenance request."}
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
						{isPending
							? isReschedule
								? "Rescheduling…"
								: "Assigning…"
							: isReschedule
							? "Reschedule"
							: "Create Schedule"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
