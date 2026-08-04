"use client";

// components/ItinerarySequenceManager.tsx
//
// Lets the Scheduler pick a technician + date and reorder that day's stops.
// Up/down buttons rather than drag-and-drop — there's no drag library
// already in this project, and arrows need zero new dependencies while
// staying just as usable for a handful of stops in one day.
import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ComboBoxResponsive, ComboboxItem } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { ArrowUp, ArrowDown, ListOrdered, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { fetchData } from "@/lib/fetchData";
import { apiPath } from "@/lib/base-path";
import { showAppToast } from "@/components/ui/apptoast";
import { useSchedules } from "@/hooks/use-schedules";

interface Technician {
	id: number;
	name: string;
}

// Module-level so it's the SAME array reference on every render. The bug
// this fixes: `const { data: schedules = [] } = useSchedules(...)` looks
// harmless, but a `= []` default is a NEW array literal every time `data`
// is undefined (loading, or before a technician/date is picked) — and the
// effect below depends on `schedules` by reference. A fresh reference each
// render means the effect re-fires every render, calls setOrder, triggers a
// re-render, and repeats forever ("Maximum update depth exceeded"). Falling
// back to this shared constant instead keeps the reference stable across
// renders whenever there's genuinely no data, so the effect only fires when
// the schedules actually change.
const EMPTY_SCHEDULES: never[] = [];

export function ItinerarySequenceManager() {
	const queryClient = useQueryClient();
	const [technicianId, setTechnicianId] = useState<string | null>(null);
	const [date, setDate] = useState<Date | undefined>(new Date());
	const [order, setOrder] = useState<number[] | null>(null);
	const [isSaving, setIsSaving] = useState(false);

	const { data: technicians = [] } = useQuery<Technician[]>({
		queryKey: ["technicians"],
		queryFn: () => fetchData<Technician[]>("/api/technicians"),
		staleTime: 1000 * 60 * 5,
	});
	const technicianOptions: ComboboxItem[] = technicians.map((t) => ({
		value: String(t.id),
		label: t.name,
	}));

	const scheduledAt = date ? format(date, "yyyy-MM-dd") : undefined;
	const {
		data: schedulesData,
		isLoading,
		isFetching,
	} = useSchedules({
		technicianId: technicianId ? Number(technicianId) : undefined,
		scheduledAt,
	});
	const schedules = schedulesData ?? EMPTY_SCHEDULES;

	// Local, reorderable copy of the day's schedule ids. Reset whenever the
	// underlying data changes (new technician/date picked, or a save just
	// landed) so a stale local order can never drift from the server.
	useEffect(() => {
		setOrder(schedules.map((s) => s.id));
	}, [schedules]);

	const byId = new Map(schedules.map((s) => [s.id, s]));
	const orderedSchedules = (order ?? [])
		.map((id) => byId.get(id))
		.filter((s): s is (typeof schedules)[number] => !!s);

	const move = (index: number, dir: -1 | 1) => {
		setOrder((prev) => {
			if (!prev) return prev;
			const next = [...prev];
			const target = index + dir;
			if (target < 0 || target >= next.length) return prev;
			[next[index], next[target]] = [next[target], next[index]];
			return next;
		});
	};

	const isDirty =
		!!order &&
		order.length === schedules.length &&
		order.some((id, i) => id !== schedules[i]?.id);

	const handleSave = async () => {
		if (!technicianId || !scheduledAt || !order || order.length === 0) return;
		setIsSaving(true);
		try {
			const res = await fetch(apiPath("/api/schedule/sequence"), {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					technicianId: Number(technicianId),
					scheduledAt,
					orderedScheduleIds: order,
				}),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error || "Failed to save the new order.");
			}
			showAppToast({
				message: "Itinerary order saved",
				position: "top-right",
				color: "success",
			});
			queryClient.invalidateQueries({ queryKey: ["schedules"] });
		} catch (err) {
			showAppToast({
				message: "Save failed",
				description: err instanceof Error ? err.message : "Please try again.",
				position: "top-right",
				color: "error",
			});
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<Card className="rounded-2xl border shadow-sm">
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base font-semibold">
					<ListOrdered className="h-5 w-5 text-primary" />
					Itinerary Order
				</CardTitle>
				<p className="text-sm text-muted-foreground">
					Set the visit order for a technician&apos;s day. This is what the
					technician sees on their Time In screen and itinerary.
				</p>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div className="space-y-1">
						<label className="text-sm font-medium">Technician</label>
						<ComboBoxResponsive
							data={technicianOptions}
							placeholder="Select technician"
							selectedValue={technicianId}
							onValueChange={setTechnicianId}
							emptyMessage="No technician found."
						/>
					</div>
					<div className="space-y-1">
						<label className="text-sm font-medium">Date</label>
						<DatePicker
							onDateSelect={setDate}
							selectedDate={date}
							allowFutureDates
						/>
					</div>
				</div>

				{!technicianId || !date ? (
					<p className="py-6 text-center text-sm text-muted-foreground">
						Pick a technician and date to see their itinerary.
					</p>
				) : isLoading ? (
					<p className="py-6 text-center text-sm text-muted-foreground">
						Loading…
					</p>
				) : orderedSchedules.length === 0 ? (
					<p className="py-6 text-center text-sm text-muted-foreground">
						No schedules for this technician on this date.
					</p>
				) : (
					<div className="space-y-2">
						{orderedSchedules.map((s, idx) => (
							<div
								key={s.id}
								className="flex items-center gap-3 rounded-xl border p-3"
							>
								<Badge variant="outline" className="w-8 shrink-0 justify-center">
									{idx + 1}
								</Badge>
								<div className="min-w-0 flex-1">
									<p className="truncate font-medium">{s.client?.name}</p>
									<p className="truncate text-xs text-muted-foreground">
										{s.location?.name}
									</p>
								</div>
								<div className="flex shrink-0 gap-1">
									<Button
										variant="outline"
										size="icon"
										className="h-8 w-8"
										disabled={idx === 0}
										onClick={() => move(idx, -1)}
										aria-label="Move up"
									>
										<ArrowUp className="h-4 w-4" />
									</Button>
									<Button
										variant="outline"
										size="icon"
										className="h-8 w-8"
										disabled={idx === orderedSchedules.length - 1}
										onClick={() => move(idx, 1)}
										aria-label="Move down"
									>
										<ArrowDown className="h-4 w-4" />
									</Button>
								</div>
							</div>
						))}

						<div className="flex justify-end pt-2">
							<Button onClick={handleSave} disabled={!isDirty || isSaving || isFetching}>
								{isSaving ? (
									<>
										<Loader2 className="h-4 w-4 animate-spin" /> Saving…
									</>
								) : (
									"Save Order"
								)}
							</Button>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
