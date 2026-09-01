// components/pages/Monitoring.tsx
//
// New Monitoring report, laid out after the attached "Report Visit.xlsx"
// reference: clients split into South Area / North Area sections, with
// gray separator rows marking each proximity Client Group inside a
// section — same shape as the Excel's yellow "SOUTH AREA"/"NORTH AREA"
// header rows and its blank-row client clusters, just rendered instead of
// left as spreadsheet formatting.
//
// Area (South/North) and Client Group are both per-CLIENT attributes (see
// components/pages/Clients.tsx, where they're maintained) — a client can
// have more than one location under it, so they're shown once per section/
// group rather than repeated as their own row column; the per-row "AREA"
// text the Excel used for each entry (a locality like "ALABANG") maps to
// this app's existing `locations` table and is shown here as "Location".
//
// Backend: lib/server/monitoring-report-query.ts via /api/monitoring-report
// — see that file for exactly how "No. Of Printers" (an as-of-month
// snapshot, not "right now") and "Total Visits" (actual completed
// `maintain` records, never scheduled-only) are computed.
"use client";

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableHeader,
	TableRow,
	TableHead,
	TableBody,
	TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, MapPin } from "lucide-react";
import { fetchData } from "@/lib/fetchData";

interface MonitoringReportRow {
	clientId: number;
	clientName: string;
	area: "South" | "North";
	clientGroupId: number | null;
	clientGroupName: string | null;
	locationId: number;
	locationName: string;
	printerCount: number;
	totalVisits: number;
	lastVisit: string | null;
	status: "NO SCHEDULE" | "LOW VISIT" | "VISITED";
}

interface MonitoringReportResponse {
	month: string;
	year: number;
	rows: MonitoringReportRow[];
}

const STATUS_BADGE_CLASS: Record<MonitoringReportRow["status"], string> = {
	"NO SCHEDULE": "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30",
	"LOW VISIT": "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
	VISITED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
};

/** yyyy-MM for <input type="month"> and the report API, defaulting to the
 * current Philippine month — same approach as AttendanceReport.tsx's
 * currentPhMonth(). */
function currentPhMonth(): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Manila",
		year: "numeric",
		month: "2-digit",
	}).formatToParts(new Date());
	const year = parts.find((p) => p.type === "year")?.value ?? "";
	const month = parts.find((p) => p.type === "month")?.value ?? "";
	return `${year}-${month}`;
}

function formatMonthLabel(month: string): string {
	const [y, m] = month.split("-").map(Number);
	if (!y || !m) return month;
	return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
		month: "long",
		year: "numeric",
	});
}

function formatLastVisit(lastVisit: string | null): string {
	if (!lastVisit) return "—";
	const [y, m, d] = lastVisit.split("-").map(Number);
	if (!y || !m || !d) return lastVisit;
	return new Date(y, m - 1, d).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

/** Section-header + gray-separator rendering unit: within one Area, rows
 * are broken into consecutive runs sharing the same Client Group (or, for
 * an ungrouped client, its own single-client run) — mirroring the Excel's
 * blank-row-separated clusters. */
interface GroupRun {
	key: string;
	label: string;
	rows: MonitoringReportRow[];
}

function buildGroupRuns(rows: MonitoringReportRow[]): GroupRun[] {
	// Bug fix: `runs[i].key` used to be stored with a `-${index}` suffix
	// appended (so React had a unique key per run), then compared directly
	// against the un-suffixed `key` computed for the current row — those two
	// strings could never be equal, so every single row started a new run
	// and got its own separator, regardless of whether the previous row
	// shared the same Client Group. `baseKey` is now tracked separately
	// from the React-facing `key`, so consecutive rows in the same group
	// (or, for a multi-location client, the same client) correctly merge
	// into one run with one header, per the "SG1 holds every client in it,
	// shown once" requirement.
	const runs: (GroupRun & { baseKey: string })[] = [];
	for (const row of rows) {
		const baseKey = row.clientGroupId != null ? `group-${row.clientGroupId}` : `client-${row.clientId}`;
		const last = runs[runs.length - 1];
		if (last && last.baseKey === baseKey) {
			last.rows.push(row);
		} else {
			runs.push({
				key: `${baseKey}-${runs.length}`,
				baseKey,
				label: row.clientGroupName ?? row.clientName,
				rows: [row],
			});
		}
	}
	return runs;
}

const COLUMN_COUNT = 6;

function AreaSection({ title, rows }: { title: string; rows: MonitoringReportRow[] }) {
	const runs = useMemo(() => buildGroupRuns(rows), [rows]);

	if (rows.length === 0) {
		return (
			<div>
				<h3 className="mb-2 text-sm font-semibold text-muted-foreground">{title}</h3>
				<p className="text-sm text-muted-foreground italic">No clients assigned to this Area yet.</p>
			</div>
		);
	}

	return (
		<div className="space-y-2">
			<h3 className="flex items-center gap-2 text-sm font-semibold">
				<MapPin className="h-4 w-4 text-primary" />
				{title}
				<span className="font-normal text-muted-foreground">
					({rows.length} location{rows.length === 1 ? "" : "s"})
				</span>
			</h3>
			<div className="rounded-md border overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Client</TableHead>
							<TableHead>Location</TableHead>
							<TableHead className="text-right">No. Of Printers</TableHead>
							<TableHead className="text-right">Total Visits</TableHead>
							<TableHead>Last Visit</TableHead>
							<TableHead>Status</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{runs.map((run) => (
							<React.Fragment key={run.key}>
								{/* Gray separator row — the rendered equivalent of the
								    Excel's blank rows between clusters, labeled with the
								    Client Group's name so a Scheduler can see at a glance
								    which clients are meant to be visited together. */}
								<TableRow className="bg-muted/60 hover:bg-muted/60">
									<TableCell colSpan={COLUMN_COUNT} className="py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										{run.rows[0].clientGroupId != null ? run.label : `${run.label} (Ungrouped)`}
									</TableCell>
								</TableRow>
								{run.rows.map((row) => (
									<TableRow key={`${row.clientId}-${row.locationId}`}>
										<TableCell className="font-medium">{row.clientName}</TableCell>
										<TableCell>{row.locationName}</TableCell>
										<TableCell className="text-right">{row.printerCount}</TableCell>
										<TableCell className="text-right">{row.totalVisits}</TableCell>
										<TableCell>{formatLastVisit(row.lastVisit)}</TableCell>
										<TableCell>
											<Badge variant="outline" className={STATUS_BADGE_CLASS[row.status]}>
												{row.status}
											</Badge>
										</TableCell>
									</TableRow>
								))}
							</React.Fragment>
						))}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}

export default function MonitoringPage() {
	const [month, setMonth] = useState<string>(currentPhMonth());

	const { data, isLoading, isError, error } = useQuery<MonitoringReportResponse, Error>({
		queryKey: ["/api/monitoring-report", month],
		queryFn: () => fetchData<MonitoringReportResponse>(`/api/monitoring-report?month=${month}`),
		staleTime: 1000 * 60,
	});

	const southRows = useMemo(() => (data?.rows ?? []).filter((r) => r.area === "South"), [data]);
	const northRows = useMemo(() => (data?.rows ?? []).filter((r) => r.area === "North"), [data]);

	return (
		<div className="rounded-2xl grid grid-cols-1 gap-4 p-[1px] bg-gradient-to-r from-blue-400 via-green-500 to-red-400">
			<Card className="rounded-2xl bg-white dark:bg-black">
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base font-semibold">
						<Activity className="h-5 w-5 text-primary" />
						Monitoring Report
					</CardTitle>
					<p className="text-sm text-muted-foreground">
						Visit activity by client, grouped by Area and by nearby-client
						groups — use this to plan and assign technician itineraries.
						Figures reflect actual completed maintenance visits for the
						selected month, not scheduled-only itineraries.
					</p>
				</CardHeader>
				<CardContent className="space-y-6">
					<div className="flex flex-wrap items-end gap-3">
						<div className="flex flex-col gap-1">
							<label htmlFor="monitoring-month" className="text-xs font-medium text-muted-foreground">
								Month
							</label>
							<input
								id="monitoring-month"
								type="month"
								value={month}
								max={currentPhMonth()}
								onChange={(e) => setMonth(e.target.value)}
								className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
							/>
						</div>
						<div className="text-sm text-muted-foreground pb-2">
							Showing <span className="font-medium text-foreground">{formatMonthLabel(month)}</span>
						</div>
					</div>

					{isLoading && (
						<div className="space-y-3">
							<Skeleton className="h-6 w-40" />
							<Skeleton className="h-10 w-full" />
							<Skeleton className="h-8 w-full" />
							<Skeleton className="h-8 w-full" />
						</div>
					)}

					{isError && (
						<p className="text-sm text-red-600">
							Error: {error?.message || "Failed to load the Monitoring report. Please try again later."}
						</p>
					)}

					{!isLoading && !isError && (
						<div className="space-y-8">
							<AreaSection title="South Area" rows={southRows} />
							<AreaSection title="North Area" rows={northRows} />
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
