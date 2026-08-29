"use client";

// components/pages/RelatedIssues.tsx
//
// Free-text search over every maintenance report's Notes, so a
// Scheduler/Admin can find every past printer with a given symptom
// ("gear", "jam", "roller"...) instead of only what's currently in
// Pending Maintenance. Each result is a card (Model / Serial / Client up
// top, the matching Notes below); clicking the card opens the SAME Printer
// History modal used from the Printers grid (components/
// PrinterHistoryDialog.tsx), pre-armed with the searched keyword so the
// matching Notes entry is highlighted and scrolled into view the moment
// the modal opens — no manual re-scanning required.
//
// The Notes area itself is a second, separate interactive element (a
// Radix Popover, same pattern as PendingItemNotes in
// components/pages/PendingMaintenancePanel.tsx) so a Super Admin can fix a
// typo or add context inline without that click bubbling up and opening
// the history modal instead.
import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
	Search,
	Printer as PrinterIcon,
	Building2,
	Hash,
	Pencil,
} from "lucide-react";
import { fetchData } from "@/lib/fetchData";
import { apiPath } from "@/lib/base-path";
import { highlightMatches } from "@/lib/highlight-text";
import { PrinterHistoryDialog } from "@/components/PrinterHistoryDialog";
import { useUserStore } from "@/state/userStore";
import { showAppToast } from "../ui/apptoast";

interface RelatedIssueResult {
	id: number;
	printerId: number;
	serialNo: string;
	model: string;
	client: string;
	notes: string | null;
	createdAt: string;
}

interface RelatedIssuesResponse {
	results: RelatedIssueResult[];
	truncated: boolean;
}

export default function RelatedIssuesPage() {
	const { users } = useUserStore();
	// Same boundary as PendingMaintenancePanel's canEditNotes: editing
	// maintain.notes after the fact is a Super Admin-only correction. The
	// real enforcement is server-side (app/api/pending-maintenance/[id]/
	// notes/route.ts requires Super Admin regardless of this flag) — this
	// only decides whether the edit affordance is shown at all.
	const canEditNotes = users?.role === "Super Admin";

	const [search, setSearch] = useState("");
	// Typing shouldn't fire a request per keystroke — same 300ms debounce
	// pattern already used by MasterDataManager's own search box.
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [historyPrinterId, setHistoryPrinterId] = useState<number | null>(
		null
	);

	useEffect(() => {
		const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
		return () => clearTimeout(t);
	}, [search]);

	const { data, isFetching, isError } = useQuery<RelatedIssuesResponse>({
		queryKey: ["related-issues", debouncedSearch],
		queryFn: () =>
			fetchData<RelatedIssuesResponse>(
				`/api/related-issues?keyword=${encodeURIComponent(debouncedSearch)}`
			),
		enabled: debouncedSearch.length > 0,
		staleTime: 30_000,
	});

	const results = debouncedSearch ? data?.results ?? [] : [];

	return (
		<Card className="rounded-2xl border shadow-sm">
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base font-semibold">
					<Search className="h-5 w-5 text-primary" />
					Related Issues
				</CardTitle>
				<p className="text-sm text-muted-foreground">
					Search past maintenance notes for a symptom, part, or phrase to
					find every printer that&apos;s had it before.
				</p>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="relative max-w-md">
					<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search maintenance notes (e.g. &quot;gear&quot;, &quot;jam&quot;, &quot;roller&quot;)"
						className="pl-9"
					/>
				</div>

				{!debouncedSearch ? (
					<p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
						Type a keyword above to search maintenance notes.
					</p>
				) : isFetching ? (
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{[0, 1, 2].map((i) => (
							<Skeleton key={i} className="h-40 w-full rounded-xl" />
						))}
					</div>
				) : isError ? (
					<p className="rounded-lg border border-dashed py-10 text-center text-sm text-destructive">
						Couldn&apos;t search maintenance notes right now. Try again.
					</p>
				) : results.length === 0 ? (
					<p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
						No maintenance notes match &quot;{debouncedSearch}&quot;.
					</p>
				) : (
					<>
						{data?.truncated && (
							<p className="text-xs text-muted-foreground">
								Showing the {results.length} most recent matches. Narrow your
								search to see more specific results.
							</p>
						)}
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{results.map((r) => (
								// A plain div (not a <button>) — the Notes popover below
								// renders its own trigger button, and a button can't
								// legally nest inside another button.
								<div
									key={r.id}
									role="button"
									tabIndex={0}
									onClick={() => setHistoryPrinterId(r.printerId)}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											setHistoryPrinterId(r.printerId);
										}
									}}
									className="flex cursor-pointer flex-col gap-3 rounded-xl border p-4 text-left transition-colors hover:border-primary/50 hover:bg-muted/40"
								>
									{/* Top section: Model, Serial Number, Client */}
									<div className="space-y-1.5">
										<div className="flex items-center gap-1.5 text-sm font-semibold">
											<PrinterIcon className="h-4 w-4 shrink-0 text-primary" />
											{r.model}
										</div>
										<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
											<Hash className="h-3.5 w-3.5 shrink-0" />
											{r.serialNo}
										</div>
										<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
											<Building2 className="h-3.5 w-3.5 shrink-0" />
											{r.client}
										</div>
									</div>

									{/* Bottom section: the matching Notes — its own
									    interactive element, see RelatedIssueNotes below. */}
									<RelatedIssueNotes
										item={r}
										keyword={debouncedSearch}
										canEdit={canEditNotes}
									/>
								</div>
							))}
						</div>
					</>
				)}
			</CardContent>

			<PrinterHistoryDialog
				printerId={historyPrinterId}
				highlightKeyword={debouncedSearch}
				onOpenChange={(open) => {
					if (!open) setHistoryPrinterId(null);
				}}
			/>
		</Card>
	);
}

/**
 * The Notes area of a Related Issues card. Read-only, highlighted preview
 * text for everyone except Super Admin (`canEdit`), who gets a Radix
 * Popover with an editable textarea instead — same UI/UX as
 * PendingItemNotes in components/pages/PendingMaintenancePanel.tsx. Clicks
 * here are stopped from bubbling up to the card's own onClick, so opening
 * (or editing in) the popover never also opens the Printer History modal.
 *
 * Saves PATCH `/api/pending-maintenance/[id]/notes` — the same
 * maintain.notes-editing endpoint Pending Maintenance already uses (it
 * takes a maintain id and isn't specific to that page), so there's exactly
 * one server-side edit path, one Super-Admin-only enforcement point, for
 * this field.
 */
function RelatedIssueNotes({
	item,
	keyword,
	canEdit,
}: {
	item: RelatedIssueResult;
	keyword: string;
	canEdit: boolean;
}) {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState(item.notes ?? "");

	const { mutate: saveNotes, isPending } = useMutation({
		mutationFn: async () => {
			const res = await fetch(
				apiPath(`/api/pending-maintenance/${item.id}/notes`),
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ notes: draft }),
				}
			);
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				throw new Error(data.error || "Could not save notes.");
			}
			return data as { id: number; notes: string | null };
		},
		onSuccess: (updated) => {
			showAppToast({
				message: "Notes updated",
				position: "top-right",
				color: "success",
			});
			// Update the cached search results in place rather than
			// invalidating/refetching — a refetch re-runs the keyword search
			// server-side, and an edit that removes the matched keyword
			// would make the card vanish out from under the user right as
			// they save. Patching the cache directly keeps the card in
			// place with the new text, which is what "immediately reflect
			// the updated value" means here.
			queryClient.setQueriesData<RelatedIssuesResponse>(
				{ queryKey: ["related-issues"] },
				(old) =>
					old
						? {
								...old,
								results: old.results.map((r) =>
									r.id === updated.id ? { ...r, notes: updated.notes } : r
								),
							}
						: old
			);
			setOpen(false);
		},
		onError: (err) => {
			showAppToast({
				message: "Couldn't save notes",
				description: err instanceof Error ? err.message : "Please try again.",
				position: "top-right",
				color: "error",
			});
		},
	});

	if (!canEdit) {
		return (
			<p className="line-clamp-4 rounded-lg bg-muted p-2.5 text-sm text-muted-foreground">
				{item.notes ? highlightMatches(item.notes, keyword) : "—"}
			</p>
		);
	}

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				// Re-sync the draft from the current cached value every time
				// the popover opens, so a stale edit from a previously
				// cancelled session never clobbers a newer value on save.
				if (next) setDraft(item.notes ?? "");
				setOpen(next);
			}}
		>
			<PopoverTrigger asChild>
				<button
					type="button"
					onClick={(e) => e.stopPropagation()}
					// The card's role="button" onKeyDown treats Space/Enter as
					// "open the history modal". React bubbles synthetic events
					// along the COMPONENT tree, not the DOM tree — so a keydown
					// on this trigger (or, below, inside the popover content,
					// which Radix renders in a portal elsewhere in the DOM)
					// still reaches the card's handler unless it's stopped
					// here. Without this, pressing Space to activate this
					// trigger button also "clicks" the card underneath it.
					onKeyDown={(e) => e.stopPropagation()}
					className="flex w-full items-start gap-1.5 rounded-lg bg-muted p-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/70"
				>
					<Pencil className="mt-0.5 h-3 w-3 shrink-0 opacity-60" />
					{item.notes ? (
						<span className="line-clamp-4">
							{highlightMatches(item.notes, keyword)}
						</span>
					) : (
						<span className="italic">Click to add notes…</span>
					)}
				</button>
			</PopoverTrigger>
			<PopoverContent
				className="w-80"
				onClick={(e) => e.stopPropagation()}
				// Same reasoning as the trigger's onKeyDown above: this content
				// is portaled outside the card's DOM subtree, but React's
				// synthetic events still bubble through the component tree —
				// so typing in the textarea, or pressing Space/Enter on
				// Save/Cancel, would otherwise also open the Printer History
				// modal behind it. Stopped here, once, for every control
				// inside (textarea, Cancel, Save).
				onKeyDown={(e) => e.stopPropagation()}
			>
				<div className="space-y-2">
					<label className="text-sm font-medium">Notes</label>
					<Textarea
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						rows={4}
						maxLength={2000}
						placeholder="Add notes for this report…"
						disabled={isPending}
						autoFocus
					/>
					<div className="flex justify-end gap-2">
						<Button
							size="sm"
							variant="outline"
							onClick={() => setOpen(false)}
							disabled={isPending}
						>
							Cancel
						</Button>
						<Button
							size="sm"
							onClick={() => saveNotes()}
							disabled={isPending || draft.trim() === (item.notes ?? "").trim()}
						>
							{isPending ? "Saving…" : "Save"}
						</Button>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
