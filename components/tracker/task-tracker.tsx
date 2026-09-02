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
import { Loader2, Copy } from "lucide-react";
import { apiPath } from "@/lib/base-path";
import { PrinterHistoryDialog } from "@/components/PrinterHistoryDialog";
import { showAppToast } from "@/components/ui/apptoast";
import { CollectionModal } from "@/components/tracker/collection-modal";
import { ImageViewerModal } from "@/components/tracker/image-viewer-modal";
import type { ScheduleSupportServiceDetail } from "@/types/tracker";

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
		supportService: ScheduleSupportServiceDetail | null;
	}>({
		queryKey: ["schedule-details", selectedId],
		queryFn: () =>
			fetchJSON<{ data: ScheduleDetailRow[]; supportService: ScheduleSupportServiceDetail | null }>(
				`/api/schedules/${selectedId}/details`
			),
		enabled: selectedId != null,
		staleTime: 60_000,
	});

	const [collectionModalOpen, setCollectionModalOpen] = React.useState(false);

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

	// The schedule the Details panel is currently showing — used below to
	// fall back to the Scheduler's own Notes when this schedule has no
	// printers assigned yet (scheduleDetails is empty), instead of the old
	// generic "Please Get Check." placeholder. Matched by id off the SAME
	// list the grid renders, so the notes shown can never belong to a
	// different client/schedule than the one currently selected.
	const selectedSchedule = React.useMemo(
		() => schedules?.data.find((s) => s.id === selectedId) ?? null,
		[schedules, selectedId]
	);

	const handleRowClick = (mtId: number) => {
		const url = apiPath(`/api/pdf?mtId=${mtId}`);
		window.open(url, "_blank");
	};
	const [historyPrinterId, setHistoryPrinterId] = React.useState<number | null>(
		null
	);

	// Copies the Serial Number for one Schedule Details row. showAppToast's
	// default duration (5s) already gives the "temporary fading
	// notification" the request asks for — no separate timer needed here.
	const handleCopySerialNo = async (serialNo: string) => {
		try {
			await navigator.clipboard.writeText(serialNo);
			showAppToast({
				message: "Copied to clipboard",
				description: serialNo,
				position: "top-right",
				color: "success",
			});
		} catch {
			showAppToast({
				message: "Couldn't copy",
				description: "Your browser blocked clipboard access.",
				position: "top-right",
				color: "error",
			});
		}
	};

	return (
		<>
		<div className="grid grid-cols-1 gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-2">
			{/* Left: Schedules */}
			<Card className="flex max-h-[75vh] min-h-0 flex-col overflow-hidden lg:max-h-none">
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
				<CardContent className="min-h-0 flex-1 px-0">
					{/* Plain overflow-y-auto, not a second Radix ScrollArea —
					    Table (ui/table.tsx) already wraps itself in its own
					    horizontal Radix ScrollArea, and nesting a vertical-only
					    ScrollArea around it sets overflow-x:hidden on that
					    outer viewport (Radix only enables overflow-x:"scroll"
					    when a horizontal scrollbar is also mounted), which
					    clips this table's horizontal overflow instead of
					    letting it scroll. */}
					<div className="h-full overflow-y-auto">
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
					</div>
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
			<Card className="flex max-h-[75vh] min-h-0 flex-col overflow-hidden lg:max-h-none">
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
				<CardContent className="min-h-0 flex-1 px-0">
					{/* Same reasoning as the Schedules table above: a plain
					    overflow-y-auto div, not a second Radix ScrollArea, so
					    this Table's own horizontal scrolling isn't clipped by
					    a vertical-only outer viewport's overflow-x:hidden. */}
					<div className="h-full overflow-y-auto">
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
										<TableHead>MT Id</TableHead>
										<TableHead>Updated</TableHead>
										<TableHead className="text-right">Action</TableHead>
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
													{/* Its own click target, separate from the row's — the
													    row opens the Maintenance Report PDF (handleRowClick,
													    only once maintained); this always opens the Printer
													    History modal, the same one used on the Printers nav
													    page, regardless of maintained state. stopPropagation
													    keeps the two from firing together. */}
													<button
														type="button"
														onClick={(e) => {
															e.stopPropagation();
															setHistoryPrinterId(d.printerId);
														}}
														className="w-fit text-left font-medium text-primary underline-offset-2 hover:underline"
													>
														{d.serialNo}
													</button>
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
											<TableCell>{d.mtId ?? "—"}</TableCell>
											<TableCell>
												{formatTimeToAmPm(d.maintainedDate!) ?? "—"}
											</TableCell>
											<TableCell className="text-right">
												<Button
													variant="ghost"
													size="icon"
													className="h-8 w-8"
													onClick={(e) => {
														e.stopPropagation();
														handleCopySerialNo(d.serialNo);
													}}
													aria-label={`Copy serial number ${d.serialNo}`}
													title="Copy serial number"
												>
													<Copy className="h-4 w-4" />
												</Button>
											</TableCell>
										</TableRow>
									);
								})}
								{!loadingDetails && (details?.data?.length ?? 0) === 0 && (
									<TableRow>
										{/* py-4 px-3 (was py-8, no horizontal padding override) —
										    less wasted vertical space around the card now that
										    it fills the available width instead of being
										    centered/capped at max-w-md; see requirement 2. */}
										<TableCell colSpan={6} className="px-3 py-4">
											{details?.supportService ? (
												<SupportServiceDetailsCard
													supportService={details.supportService}
													clientName={selectedSchedule?.client ?? ""}
													onOpenCollection={() => setCollectionModalOpen(true)}
												/>
											) : selectedSchedule ? (
												<div className="mx-auto max-w-md space-y-1 text-center">
													<p className="text-sm font-medium text-muted-foreground">
														No printers are assigned to this schedule yet.
													</p>
													<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
														Scheduler&apos;s notes for {selectedSchedule.client}
													</p>
													<p className="text-sm text-foreground">
														{selectedSchedule.notes?.trim()
															? selectedSchedule.notes
															: "No notes were entered for this schedule — the technician hasn't submitted a Support Service for it yet either."}
													</p>
												</div>
											) : (
												<p className="text-center text-lg text-muted-foreground">
													Select a schedule to view details.
												</p>
											)}
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					)}
					</div>
				</CardContent>
			</Card>
		</div>

		<PrinterHistoryDialog
			printerId={historyPrinterId}
			onOpenChange={(open) => {
				if (!open) setHistoryPrinterId(null);
			}}
		/>

		{/* Only rendered once we actually have everything a collection
		    needs — clientId, the support service id, and the schedule id.
		    selectedSchedule/details are both loaded async, so this stays
		    unmounted (rather than open with blank props) until both are
		    ready, which also means closing+reopening for a different
		    schedule always mounts fresh instead of showing a stale one. */}
		{selectedSchedule && details?.supportService && (
			<CollectionModal
				open={collectionModalOpen}
				onOpenChange={setCollectionModalOpen}
				clientId={selectedSchedule.clientId}
				clientName={selectedSchedule.client}
				supportServiceId={details.supportService.id}
				scheduleId={selectedSchedule.id}
			/>
		)}
		</>
	);
}

/** Requirement 3 (Schedule Details card: Notes + Photo, card-style) and
 *  requirement 4 (Collection type → clickable, opens the modal) — kept
 *  as its own component rather than inlined in the TableCell above
 *  purely for readability; it's only ever used here. */
function SupportServiceDetailsCard({
	supportService,
	clientName,
	onOpenCollection,
}: {
	supportService: ScheduleSupportServiceDetail;
	clientName: string;
	onOpenCollection: () => void;
}) {
	const isCollection = supportService.supportServiceType === "Collection";
	const [imageViewerOpen, setImageViewerOpen] = React.useState(false);
	const statusBadge =
		supportService.status === "Achieved" ? (
			<Badge className="bg-emerald-600 hover:bg-emerald-600">Achieved</Badge>
		) : supportService.status === "Not Achieved" ? (
			<Badge variant="destructive">Not Achieved</Badge>
		) : (
			<Badge variant="outline">Pending</Badge>
		);

	return (
		// No onClick on the Card itself anymore — that ambient
		// "click-anywhere-to-open-Collection" behavior is exactly what
		// fought with the image's own click no matter how many layers of
		// stopPropagation got added around it (Radix's Dialog does its own
		// outside-click detection in the CAPTURE phase, which runs before
		// a descendant's bubble-phase stopPropagation ever gets a chance
		// to matter). Rather than keep patching that fight, the Collection
		// action is now its own explicit button below, entirely outside
		// the image/notes area — there is no longer a shared clickable
		// ancestor for the two to collide over, which fixes this
		// structurally instead of defensively.
		<Card className="w-full text-left">
			<CardContent className="space-y-4 pt-4">
				<div className="flex items-center justify-between">
					<div>
						<p className="text-sm font-semibold">{clientName}</p>
						<Badge variant="secondary" className="mt-1">
							{supportService.supportServiceType}
						</Badge>
					</div>
					{statusBadge}
				</div>

				{/* Notes — given more room and a visually distinct block
				    (border + padding + slightly larger text) instead of a
				    plain paragraph, per "make ... Notes more prominent and
				    readable." */}
				<div className="rounded-md border bg-muted/30 p-3">
					<p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
						Technician&apos;s Notes
					</p>
					<p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
						{supportService.technicianNotes?.trim()
							? supportService.technicianNotes
							: "No notes were submitted."}
					</p>
				</div>

				{supportService.photoUrl && (
					<div>
						<p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
							Captured Photo
						</p>
						{/* Plain <img>, not next/image — this project's
						    next.config has no remotePatterns configured for R2's
						    domain, and the URL itself is a short-lived (60s)
						    presigned link anyway, which next/image's own
						    optimization/caching layer isn't a good fit for. */}
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src={supportService.photoUrl}
							alt="Support Service submission"
							// Much taller than before (max-h-64 → max-h-[32rem])
							// now that there's no competing max-w-md card
							// constraint to work around — see requirement 2
							// ("Maximize Schedule Details Display").
							className="max-h-[32rem] w-full cursor-zoom-in rounded-md border object-contain transition-opacity hover:opacity-90"
							onClick={(e) => {
								// No longer strictly load-bearing (there's no
								// parent onClick left to fight), but kept as
								// cheap insurance against a future wrapping
								// handler reintroducing the same class of bug.
								e.stopPropagation();
								setImageViewerOpen(true);
							}}
						/>
					</div>
				)}

				{isCollection && (
					<Button
						type="button"
						variant="secondary"
						className="w-full"
						onClick={onOpenCollection}
					>
						{supportService.status === "Achieved"
							? "Record the Collection for this task"
							: "Open Collection form"}
					</Button>
				)}
			</CardContent>

			{supportService.photoUrl && (
				<ImageViewerModal
					open={imageViewerOpen}
					onOpenChange={setImageViewerOpen}
					imageUrl={supportService.photoUrl}
					title={`${clientName} — ${supportService.supportServiceType} photo`}
				/>
			)}
		</Card>
	);
}
