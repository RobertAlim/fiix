"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
	Card,
	CardHeader,
	CardTitle,
	CardDescription,
	CardContent,
	CardFooter,
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
import { apiPath } from "@/lib/base-path";

async function fetchJSON<T>(url: string): Promise<T> {
	const res = await fetch(apiPath(url));
	if (!res.ok) throw new Error(await res.text());
	return res.json() as Promise<T>;
}

export default function TaskTracker() {
	const [query, setQuery] = React.useState("");
	const [selectedId, setSelectedId] = React.useState<number | null>(null);
	const [currentPage, setCurrentPage] = React.useState(1);
	const itemsPerPage = 10;

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

	const totalPages = Math.ceil(filtered.length / itemsPerPage);

	const currentTableData = React.useMemo(() => {
		const firstPageIndex = (currentPage - 1) * itemsPerPage;
		const lastPageIndex = firstPageIndex + itemsPerPage;
		return filtered.slice(firstPageIndex, lastPageIndex);
	}, [currentPage, filtered, itemsPerPage]);

	// Reset to page 1 whenever the user searches
	React.useEffect(() => {
		setCurrentPage(1);
	}, [query]);

	React.useEffect(() => {
		if (selectedId == null && (schedules?.data?.length ?? 0) > 0) {
			setSelectedId(schedules!.data[0].id);
		}
	}, [schedules, selectedId]);

	const handleRowClick = (mtId: number) => {
		const url = apiPath(`/api/pdf?mtId=${mtId}`);
		window.open(url, "_blank");
	};

	return (
		<div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
			{/* Left: Schedules */}
			<Card className="flex min-h-0 flex-col overflow-hidden">
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
				<CardContent className="min-h-0 flex-1 overflow-y-auto px-0">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-[90px]">Sched #</TableHead>
								<TableHead>Date</TableHead>
								<TableHead>Client / Location</TableHead>
								<TableHead>Technician</TableHead>
								<TableHead>Priority</TableHead>
								{/* Frozen while the table scrolls horizontally on
								    narrow viewports — sticky to the right edge with
								    its own opaque background (matching the Card's
								    bg-card) so scrolled-under cells don't show
								    through, and a left border to visually separate
								    it from the scrolling columns. */}
								<TableHead className="sticky right-0 z-10 w-[220px] border-l bg-card">
									Progress
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{currentTableData.map((row) => (
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
									<TableCell
										className={cn(
											"sticky right-0 z-10 border-l bg-card",
											selectedId === row.id && "bg-muted/60"
										)}
									>
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
				<CardFooter className="flex items-center justify-end space-x-4 py-4">
					<div className="flex-1 text-sm text-muted-foreground">
						{filtered.length} total schedule(s).
					</div>
					<div className="flex items-center space-x-2">
						<span className="text-sm text-muted-foreground">
							Page {totalPages > 0 ? currentPage : 0} of {totalPages}
						</span>
						<Button
							variant="outline"
							size="sm"
							onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
							disabled={currentPage === 1}
						>
							Previous
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() =>
								setCurrentPage((prev) => Math.min(prev + 1, totalPages))
							}
							disabled={currentPage === totalPages || totalPages === 0}
						>
							Next
						</Button>
					</div>
				</CardFooter>
			</Card>

			{/* Right: Details */}
			<Card className="flex min-h-0 flex-col overflow-hidden">
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
				<CardContent className="min-h-0 flex-1 overflow-y-auto px-0">
					{loadingDetails && selectedId != null ? (
						<div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading details…
						</div>
					) : (
						<Table>
							<TableHeader>
								{details?.data?.length !== 0 && (
									<TableRow>
										<TableHead>Printer</TableHead>
										<TableHead>Model</TableHead>
										<TableHead>Status</TableHead>
										<TableHead>Maintained</TableHead>
										<TableHead>MT Id</TableHead>
										<TableHead>Updated</TableHead>
									</TableRow>
								)}
							</TableHeader>

							<TableBody>
								{(details?.data ?? []).map((d) => {
									const statusBadge = d.isMaintained ? (
										<Badge className="bg-emerald-600 hover:bg-emerald-600">
											Done
										</Badge>
									) : d.signPath === "Unsigned" ? (
										<Badge variant="secondary">Unsigned</Badge>
									) : (
										<Badge variant="outline">Pending</Badge>
									);

									return (
										<TableRow
											key={d.id}
											onClick={() =>
												d.isMaintained && d.mtId
													? handleRowClick(d.mtId!)
													: undefined
											}
											className={cn(
												// 👇 Only apply 'cursor-pointer' if the condition is TRUE
												d.isMaintained &&
													d.mtId &&
													"cursor-pointer transition-colors hover:bg-muted/50",

												// 👇 Optional: Add a style for non-clickable rows for visual feedback
												!(d.isMaintained && d.mtId) && "opacity-70",

												// 👇 Keep existing selection highlight logic
												selectedId === d.id && "bg-muted/60"
											)}
										>
											<TableCell>
												<div className="flex flex-col">
													<span className="font-medium">{d.serialNo}</span>
													<span className="text-xs text-muted-foreground">
														Printer ID: {d.printerId}
													</span>
												</div>
											</TableCell>
											<TableCell>{d.model ?? "—"}</TableCell>
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
												{formatTimeToAmPm(d.maintainedDate!) ?? "—"}
											</TableCell>
										</TableRow>
									);
								})}
								{!loadingDetails && (details?.data?.length ?? 0) === 0 && (
									<TableRow className={`${selectedId} bg-orange-300`}>
										<TableCell
											colSpan={6}
											className={`text-center text-lg text-black py-8`}
										>
											{selectedId
												? "Please Get Check."
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
