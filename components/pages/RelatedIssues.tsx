"use client";

// components/pages/RelatedIssues.tsx
//
// Free-text search over every maintenance report's Notes, so a
// Scheduler/Admin can find every past printer with a given symptom
// ("gear", "jam", "roller"...) instead of only what's currently in
// Pending Maintenance. Each result is a card (Model / Serial / Client up
// top, the matching Notes below); clicking one opens the SAME Printer
// History modal used from the Printers grid (components/
// PrinterHistoryDialog.tsx), pre-armed with the searched keyword so the
// matching Notes entry is highlighted and scrolled into view the moment
// the modal opens — no manual re-scanning required.
import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Printer as PrinterIcon, Building2, Hash } from "lucide-react";
import { fetchData } from "@/lib/fetchData";
import { highlightMatches } from "@/lib/highlight-text";
import { PrinterHistoryDialog } from "@/components/PrinterHistoryDialog";

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
								<button
									key={r.id}
									type="button"
									onClick={() => setHistoryPrinterId(r.printerId)}
									className="flex flex-col gap-3 rounded-xl border p-4 text-left transition-colors hover:border-primary/50 hover:bg-muted/40"
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

									{/* Bottom section: the matching Notes */}
									<p className="line-clamp-4 rounded-lg bg-muted p-2.5 text-sm text-muted-foreground">
										{r.notes ? highlightMatches(r.notes, debouncedSearch) : "—"}
									</p>
								</button>
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
