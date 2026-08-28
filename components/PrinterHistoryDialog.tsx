"use client";

// components/PrinterHistoryDialog.tsx
//
// Opened by clicking anywhere on a row in the Printers grid (see
// components/pages/Printers.tsx). Shows the printer's current info
// prominently, then its complete maintenance history underneath —
// deliberately two visually distinct sections rather than one long list,
// per the "clearly distinguish current info from history" requirement.
//
// Sizing: roughly 20% margin on very large screens (a modal any wider
// than that gets hard to scan, not easier), narrowing toward nearly
// full-screen on mobile — a literal 20% margin on a phone would leave a
// tiny, cramped dialog, which cuts against the "responsive, especially on
// smaller screens" requirement.
import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableHeader,
	TableBody,
	TableRow,
	TableHead,
	TableCell,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Printer as PrinterIcon,
	Building2,
	Layers,
	Hash,
	Loader2,
	AlertTriangle,
	User,
	Wrench,
	FileText,
	CalendarDays,
	MapPinOff,
} from "lucide-react";
import { fetchData } from "@/lib/fetchData";
import { apiPath } from "@/lib/base-path";
import { formatPhDateTime } from "@/lib/formatDate";
import { getStatusTheme, STATUS_THEME_CLASSES } from "@/lib/printer-history-status";
import { containsKeyword, highlightMatches } from "@/lib/highlight-text";
import { cn } from "@/lib/utils";

interface PrinterHistoryResponse {
	printer: {
		id: number;
		serialNo: string;
		model: string | null;
		client: string | null;
		status: string | null;
		printCount: number | null;
	};
	history: {
		id: number;
		technician: string;
		status: string;
		notes: string | null;
		replacementRepair: string | null;
		createdAt: string;
		/** The client/location this printer was assigned to AT THE TIME of
		 * this specific report — not its current one. Read from the
		 * deployment `maintain.deploymentId` points to, which a transfer
		 * never edits in place (see app/api/admin/master/printers/[id]/
		 * history/route.ts), so an older row keeps showing where the
		 * printer actually was when the technician visited. Null only for
		 * a very old record whose deployment row itself has since been
		 * deleted, which shouldn't happen in normal use. */
		client: string | null;
		location: string | null;
	}[];
}

export function PrinterHistoryDialog({
	printerId,
	onOpenChange,
	highlightKeyword,
}: {
	/** Null closes the dialog — same open/close convention as the other
	 * row-detail dialogs in this module (ResolveDialog, PrinterTransferDialog). */
	printerId: number | null;
	onOpenChange: (open: boolean) => void;
	/** Set when this dialog is opened from a Related Issues search result
	 * (components/pages/RelatedIssues.tsx) — every occurrence of this
	 * keyword in each history row's Notes gets highlighted, and the FIRST
	 * matching row is scrolled into view as soon as the data loads, so the
	 * report the user searched for is immediately visible instead of
	 * requiring them to scan/scroll through the whole history themselves.
	 * Omit (or pass an empty string) for the normal, unfiltered view — the
	 * existing behavior and design are otherwise unchanged. */
	highlightKeyword?: string;
}) {
	// Two separate refs rather than one: the desktop table and the mobile
	// card list both exist in the DOM at once (CSS `hidden`/`md:hidden`
	// toggles which is actually visible, not conditional rendering), so
	// only one ref object would get overwritten by whichever renders last.
	// Calling scrollIntoView on the hidden one below is a harmless no-op.
	const desktopMatchRef = React.useRef<HTMLTableRowElement | null>(null);
	const mobileMatchRef = React.useRef<HTMLDivElement | null>(null);

	const { data, isLoading, isError } = useQuery<PrinterHistoryResponse>({
		queryKey: ["printer-history", printerId],
		queryFn: () =>
			fetchData<PrinterHistoryResponse>(
				`/api/admin/master/printers/${printerId}/history`
			),
		enabled: printerId != null,
		staleTime: 30_000,
	});

	// The most recent (first, since `history` is newest-first) row whose
	// Notes actually contain the searched keyword — this is what gets
	// scrolled into view below, and it's what the "immediately visible, no
	// manual searching" requirement is about.
	const firstMatchId = React.useMemo(() => {
		if (!highlightKeyword?.trim() || !data) return null;
		return data.history.find((h) => containsKeyword(h.notes, highlightKeyword))
			?.id ?? null;
	}, [data, highlightKeyword]);

	// Runs once per (printer, keyword) pair, right after the matching row's
	// ref attaches — not on every render, so it doesn't fight the user if
	// they've since scrolled elsewhere in a long history list.
	React.useEffect(() => {
		if (firstMatchId == null) return;
		desktopMatchRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
		mobileMatchRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
	}, [firstMatchId]);

	// Opens the actual Maintenance Report PDF for a history row — same
	// mechanism already used by the Task Tracker (components/tracker/
	// task-tracker.tsx's handleRowClick) and the Report nav page
	// (components/pages/Report.tsx's handlePrintMaintenance): both just
	// open /api/pdf?mtId=<id> in a new tab. `h.id` here is that same
	// maintain.id (see the history route's select), so this opens the
	// exact report for the row that was clicked, not just "a" report for
	// this printer.
	const handleOpenReport = (mtId: number) => {
		window.open(apiPath(`/api/pdf?mtId=${mtId}`), "_blank");
	};

	return (
		<Dialog open={printerId != null} onOpenChange={onOpenChange}>
			<DialogContent
				className={cn(
					"flex flex-col gap-0 overflow-hidden p-0",
					// Mobile: nearly full-screen — a 20% margin here would leave
					// almost nothing to work with.
					"h-[94vh] w-[96vw] max-w-none",
					// Tablet and up: margins grow toward the ~20%-per-side target
					// as there's actually room for it. `sm:max-w-none` is
					// required here — the default DialogContent sets
					// `sm:max-w-lg`, and twMerge treats that as a DIFFERENT
					// class group than the base `max-w-none` above (different
					// responsive prefix), so without this override the dialog
					// would silently stay capped at 32rem from `sm` upward.
					"sm:h-[85vh] sm:w-[85vw] sm:max-w-none",
					"lg:h-[82vh] lg:w-[72vw]",
					"xl:h-[80vh] xl:w-[60vw] xl:max-w-[1280px]"
				)}
			>
				<DialogHeader className="border-b px-5 py-4 sm:px-8">
					<DialogTitle className="flex items-center gap-2 text-lg">
						<PrinterIcon className="h-5 w-5 text-primary" />
						{data?.printer.serialNo ?? "Printer"} history
					</DialogTitle>
					<DialogDescription>
						Current information and complete maintenance history for this
						printer.
					</DialogDescription>
				</DialogHeader>

				<ScrollArea
					className="min-h-0 flex-1"
					viewportClassName="px-5 py-5 sm:px-8 sm:py-6"
				>
					{isLoading ? (
						<div className="flex h-40 items-center justify-center text-muted-foreground">
							<Loader2 className="h-5 w-5 animate-spin" />
						</div>
					) : isError || !data ? (
						<div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
							<AlertTriangle className="h-6 w-6" />
							Couldn&apos;t load this printer&apos;s history.
						</div>
					) : (
						<div className="space-y-8">
							{/* --- Printer information: visually distinct card, always
							    first, so current status is never confused with a past
							    history entry. Two rows of two tiles — Serial/Model on
							    top, Client/Print Count below — each with room to
							    breathe rather than four tiles squeezed into one row. --- */}
							<div className="rounded-2xl border bg-muted/30 p-5 sm:p-6">
								<div className="mb-4 flex items-center justify-between">
									<h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
										Printer information
									</h3>
									{data.printer.status === "Missing" && (
										<Badge
											className="gap-1 border-destructive/30 bg-destructive/15 text-destructive"
											variant="outline"
										>
											<MapPinOff className="h-3 w-3" /> Missing
										</Badge>
									)}
								</div>

								{/* Row 1: Serial Number, Model */}
								<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
									<InfoTile
										icon={Hash}
										label="Serial Number"
										value={data.printer.serialNo}
									/>
									<InfoTile
										icon={Layers}
										label="Model"
										value={data.printer.model ?? "—"}
									/>
								</div>

								{/* Row 2: Client, Print Count */}
								<div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
									<InfoTile
										icon={Building2}
										label="Client"
										value={data.printer.client ?? "—"}
									/>
									<InfoTile
										icon={PrinterIcon}
										label="Print Count"
										value={
											data.printer.printCount != null
												? data.printer.printCount.toLocaleString()
												: "—"
										}
									/>
								</div>
							</div>

							{/* --- Maintenance history --- */}
							<div>
								<h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
									Maintenance history ({data.history.length})
								</h3>

								{data.history.length === 0 ? (
									<p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
										No maintenance records yet for this printer.
									</p>
								) : (
									<>
										{/* Table — md and up. table-fixed with explicit column
										    widths (rather than the old max-w+line-clamp combo)
										    so Notes and Replacement/Repair wrap cleanly onto
										    multiple lines instead of overlapping. */}
										<div className="hidden overflow-hidden rounded-xl border md:block">
											<Table className="table-fixed">
												<TableHeader>
													<TableRow>
														<TableHead className="w-[12%]">Technician</TableHead>
														<TableHead className="w-[12%]">Status</TableHead>
														<TableHead className="w-[17%]">
															Client at Maintenance
														</TableHead>
														<TableHead className="w-[20%]">Notes</TableHead>
														<TableHead className="w-[23%]">
															Replacement/Repair
														</TableHead>
														<TableHead className="w-[16%] text-right">
															Date
														</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{data.history.map((h) => {
														const theme = getStatusTheme(h.status);
														const isMatch = h.id === firstMatchId;
														return (
															<TableRow
																key={h.id}
																ref={isMatch ? desktopMatchRef : undefined}
																onClick={() => handleOpenReport(h.id)}
																className={cn(
																	"cursor-pointer",
																	STATUS_THEME_CLASSES[theme].row,
																	// The searched-for row gets a heavier ring on
																	// top of its status tint, so it's obvious at
																	// a glance which one the search was about —
																	// not just "somewhere in view after scrolling".
																	isMatch && "ring-2 ring-warning ring-inset"
																)}
															>
																<TableCell className="align-top font-medium">
																	<span className="break-words">
																		{h.technician}
																	</span>
																</TableCell>
																<TableCell className="align-top">
																	<Badge
																		variant="outline"
																		className={cn(
																			"whitespace-normal text-left",
																			STATUS_THEME_CLASSES[theme].badge
																		)}
																	>
																		{h.status}
																	</Badge>
																</TableCell>
																<TableCell className="align-top">
																	<span className="block whitespace-normal break-words text-sm text-muted-foreground">
																		{h.client ?? "—"}
																	</span>
																</TableCell>
																<TableCell className="align-top">
																	<span className="block whitespace-normal break-words text-sm text-muted-foreground">
																		{h.notes
																			? highlightMatches(h.notes, highlightKeyword)
																			: "—"}
																	</span>
																</TableCell>
																<TableCell className="align-top">
																	<span className="block whitespace-normal break-words text-sm">
																		{h.replacementRepair ?? "—"}
																	</span>
																</TableCell>
																<TableCell className="align-top text-right text-sm text-muted-foreground">
																	{formatPhDateTime(h.createdAt)}
																</TableCell>
															</TableRow>
														);
													})}
												</TableBody>
											</Table>
										</div>

										{/* Cards — below md, where a 6-column table would just
										    force horizontal scrolling on every row. */}
										<div className="space-y-3 md:hidden">
											{data.history.map((h) => {
												const theme = getStatusTheme(h.status);
												const isMatch = h.id === firstMatchId;
												return (
													<div
														key={h.id}
														ref={isMatch ? mobileMatchRef : undefined}
														onClick={() => handleOpenReport(h.id)}
														className={cn(
															"cursor-pointer rounded-xl border p-4",
															theme === "red" &&
																"border-destructive/30 bg-destructive/5",
															theme === "green" &&
																"border-success/30 bg-success/5",
															// Same "this is the one you searched for" treatment
															// as the desktop table row above.
															isMatch && "ring-2 ring-warning ring-inset"
														)}
													>
														<div className="mb-2 flex items-start justify-between gap-2">
															<Badge
																variant="outline"
																className={STATUS_THEME_CLASSES[theme].badge}
															>
																{h.status}
															</Badge>
															<span className="flex items-center gap-1 text-xs text-muted-foreground">
																<CalendarDays className="h-3 w-3" />
																{formatPhDateTime(h.createdAt)}
															</span>
														</div>
														<div className="space-y-1.5 text-sm">
															<div className="flex items-center gap-1.5 text-muted-foreground">
																<User className="h-3.5 w-3.5 shrink-0" />
																{h.technician}
															</div>
															{h.client && (
																<div className="flex items-center gap-1.5 text-muted-foreground">
																	<Building2 className="h-3.5 w-3.5 shrink-0" />
																	<span>{h.client}</span>
																</div>
															)}
															{h.replacementRepair && (
																<div className="flex items-start gap-1.5 text-muted-foreground">
																	<Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0" />
																	<span>{h.replacementRepair}</span>
																</div>
															)}
															{h.notes && (
																<div className="flex items-start gap-1.5 text-muted-foreground">
																	<FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
																	<span>{highlightMatches(h.notes, highlightKeyword)}</span>
																</div>
															)}
														</div>
													</div>
												);
											})}
										</div>
									</>
								)}
							</div>
						</div>
					)}
				</ScrollArea>
			</DialogContent>
		</Dialog>
	);
}

function InfoTile({
	icon: Icon,
	label,
	value,
}: {
	icon: React.ElementType;
	label: string;
	value: string;
}) {
	return (
		<div className="rounded-xl bg-background p-4 shadow-sm">
			<div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
				<Icon className="h-4 w-4" />
				{label}
			</div>
			<p className="line-clamp-2 break-words text-base font-semibold" title={value}>
				{value}
			</p>
		</div>
	);
}
