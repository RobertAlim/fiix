"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
	Card,
	CardHeader,
	CardTitle,
	CardDescription,
	CardContent,
} from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { ScheduleTrackerRow, ScheduleDetailRow } from "@/types/tracker";
import { formatDateManila, formatTimeToAmPm } from "@/lib/formatDate";
import { Loader2 } from "lucide-react";

async function fetchJSON<T>(url: string): Promise<T> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(await res.text());
	return res.json() as Promise<T>;
}

export default function TaskTracker() {
	const [query, setQuery] = React.useState("");
	const [selectedId, setSelectedId] = React.useState<number | null>(null);

	const {
		data: schedules,
		isLoading: loadingSchedules,
		// isError: errorSchedules,
	} = useQuery<{ data: ScheduleTrackerRow[] }>({
		queryKey: ["schedule-tracker"],
		queryFn: () =>
			fetchJSON<{ data: ScheduleTrackerRow[] }>("/api/schedules/tracker"),
		staleTime: 60_000,
	});

	const { data: details, isLoading: loadingDetails } = useQuery<{
		data: ScheduleDetailRow[];
	}>({
		queryKey: ["schedule-details", selectedId],
		queryFn: () =>
			fetchJSON<{ data: ScheduleDetailRow[] }>(
				`/api/schedules/${selectedId}/details`
			),
		enabled: selectedId != null,
		staleTime: 60_000,
	});

	const filtered = React.useMemo(() => {
		const list = schedules?.data ?? [];
		if (!query) return list;
		const q = query.toLowerCase();
		return list.filter((r) =>
			[
				r.client,
				r.location,
				r.technician,
				r.priority,
				r.notes ?? "",
				String(r.id),
			].some((v) => v?.toLowerCase().includes(q))
		);
	}, [schedules, query]);

	React.useEffect(() => {
		if (selectedId == null && (schedules?.data?.length ?? 0) > 0) {
			setSelectedId(schedules!.data[0].id);
		}
	}, [schedules, selectedId]);

	return (
		<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
			{/* Left: Schedules */}
			<Card className="overflow-hidden">
				<CardHeader className="space-y-1">
					<CardTitle>Maintenance Task Tracker</CardTitle>
					<CardDescription>
						Schedules overview • Progress by schedule
					</CardDescription>
					<div className="flex items-center gap-2 pt-2">
						<Input
							placeholder="Search by client, location, tech, priority, notes…"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							className="max-w-md"
						/>
						{loadingSchedules && <Loader2 className="h-4 w-4 animate-spin" />}
					</div>
				</CardHeader>
				<CardContent className="px-0">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-[90px]">Sched #</TableHead>
								<TableHead>Date</TableHead>
								<TableHead>Client / Location</TableHead>
								<TableHead>Technician</TableHead>
								<TableHead>Priority</TableHead>
								<TableHead className="w-[220px]">Progress</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{filtered.map((row) => (
								<TableRow
									key={row.id}
									onClick={() => setSelectedId(row.id)}
									className={cn(
										"cursor-pointer",
										selectedId === row.id && "bg-muted/60"
									)}
								>
									<TableCell>#{row.id}</TableCell>
									<TableCell>{formatDateManila(row.scheduledAt)}</TableCell>
									<TableCell>
										<div className="flex flex-col">
											<span className="font-medium">{row.client}</span>
											<span className="text-xs text-muted-foreground">
												{row.location}
											</span>
										</div>
									</TableCell>
									<TableCell>{row.technician}</TableCell>
									<TableCell>
										<Badge
											variant={
												row.priority.toLowerCase() === "high"
													? "destructive"
													: "secondary"
											}
										>
											{row.priority}
										</Badge>
									</TableCell>
									<TableCell>
										<div className="space-y-1">
											<div className="flex items-center justify-between text-xs">
												<span>
													{row.done}/{row.total} done
												</span>
												<span>{row.percent}%</span>
											</div>
											<Progress value={row.percent} />
										</div>
									</TableCell>
								</TableRow>
							))}
							{!loadingSchedules && filtered.length === 0 && (
								<TableRow>
									<TableCell
										colSpan={6}
										className="text-center text-sm text-muted-foreground py-8"
									>
										No schedules found.
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			{/* Right: Details */}
			<Card className="overflow-hidden">
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle>Schedule Details</CardTitle>
							<CardDescription>
								{selectedId ? (
									<>
										For schedule{" "}
										<span className="font-medium">#{selectedId}</span>
									</>
								) : (
									<>Pick a schedule from the left</>
								)}
							</CardDescription>
						</div>
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								onClick={() => selectedId && setSelectedId(selectedId)}
								disabled={!selectedId}
							>
								Refresh
							</Button>
						</div>
					</div>
				</CardHeader>
				<Separator />
				<CardContent className="px-0">
					{loadingDetails && selectedId != null ? (
						<div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading details…
						</div>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Printer</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Maintained</TableHead>
									<TableHead>MT Id</TableHead>
									<TableHead>Updated</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{(details?.data ?? []).map((d) => {
									const statusBadge = d.isMaintained ? (
										<Badge className="bg-emerald-600 hover:bg-emerald-600">
											Done
										</Badge>
									) : d.mtId ? (
										<Badge variant="secondary">In Progress</Badge>
									) : (
										<Badge variant="outline">Pending</Badge>
									);

									return (
										<TableRow key={d.id}>
											<TableCell>
												<div className="flex flex-col">
													<span className="font-medium">{d.serialNo}</span>
													<span className="text-xs text-muted-foreground">
														Printer ID: {d.printerId}
													</span>
												</div>
											</TableCell>
											<TableCell className="space-x-2">
												{statusBadge}
												{d.statusId != null && (
													<Badge variant="secondary" className="ml-1">
														statusId: {d.statusId}
													</Badge>
												)}
											</TableCell>
											<TableCell>{d.isMaintained ? "Yes" : "No"}</TableCell>
											<TableCell>{d.mtId ?? "—"}</TableCell>
											<TableCell>
												{formatTimeToAmPm(d.maintainedDate!)}
											</TableCell>
										</TableRow>
									);
								})}
								{!loadingDetails && (details?.data?.length ?? 0) === 0 && (
									<TableRow>
										<TableCell
											colSpan={5}
											className="text-center text-sm text-muted-foreground py-8"
										>
											{selectedId
												? "No printers in this schedule."
												: "Select a schedule to view details."}
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
