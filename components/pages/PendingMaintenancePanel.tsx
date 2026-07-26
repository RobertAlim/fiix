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
import { AlertTriangle, CalendarCheck2, Clock3 } from "lucide-react";
import { fetchData } from "@/lib/fetchData";
import { showAppToast } from "@/components/ui/apptoast";

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

interface Technician {
	id: string;
	name: string;
}

interface Priority {
	id: string;
	name: string;
}

function daysSince(dateStr: string): number {
	const created = new Date(dateStr);
	const diffMs = Date.now() - created.getTime();
	return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export default function PendingMaintenancePanel() {
	const queryClient = useQueryClient();
	const [assignTarget, setAssignTarget] = useState<PendingMaintenanceItem | null>(
		null
	);

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

									<div className="flex items-center justify-between pt-1">
										<span className="flex items-center gap-1 text-xs text-muted-foreground">
											<Clock3 className="h-3 w-3" />
											{daysSince(item.createdAt)}d open
										</span>

										{item.isScheduled ? (
											<Badge className="gap-1 bg-info text-info-foreground">
												<CalendarCheck2 className="h-3 w-3" />
												Scheduled
												{item.scheduledTechnicianName
													? ` · ${item.scheduledTechnicianName}`
													: ""}
											</Badge>
										) : (
											<Button size="sm" onClick={() => setAssignTarget(item)}>
												Assign
											</Button>
										)}
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
					queryClient.invalidateQueries({ queryKey: ["printers"] });
					queryClient.invalidateQueries({ queryKey: ["schedules"] });
					setAssignTarget(null);
				}}
			/>
		</Card>
	);
}

function AssignScheduleModal({
	item,
	technicians,
	priorities,
	onClose,
	onAssigned,
}: {
	item: PendingMaintenanceItem | null;
	technicians: Technician[];
	priorities: Priority[];
	onClose: () => void;
	onAssigned: () => void;
}) {
	const [technicianId, setTechnicianId] = useState<string | null>(null);
	const [priorityId, setPriorityId] = useState<string | null>(null);
	const [scheduleDate, setScheduleDate] = useState<Date | undefined>(undefined);
	const [notes, setNotes] = useState("");

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
			const res = await fetch("/api/schedule/assign", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					maintainId: item.id,
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
							<DatePicker
								onDateSelect={setScheduleDate}
								selectedDate={scheduleDate}
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
