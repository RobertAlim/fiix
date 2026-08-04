"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableHeader,
	TableRow,
	TableHead,
	TableBody,
	TableCell,
} from "@/components/ui/table";
import { ComboBoxResponsive, ComboboxItem } from "@/components/ui/combobox";
import { Download, FileSpreadsheet, Loader2, PlayCircle } from "lucide-react";
import { fetchData } from "@/lib/fetchData";
import { apiPath } from "@/lib/base-path";
import { showAppToast } from "@/components/ui/apptoast";

interface Technician {
	id: number;
	name: string;
}

interface ReportRow {
	technicianId: number;
	technician: string;
	itineraryDate: string;
	timeIn: string;
	timeOut: string;
	hoursRendered: string;
}

const CUTOFF_OPTIONS: ComboboxItem[] = [
	{ value: "", label: "Whole month" },
	{ value: "A", label: "Cutoff A (1st – 15th)" },
	{ value: "B", label: "Cutoff B (16th – end of month)" },
];

/** yyyy-MM for <input type="month"> and the report API, defaulting to the
 * current Philippine month. */
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

interface ReportFilters {
	technicianId: string | null;
	month: string;
	cutoff: string;
}

function buildQueryString(f: ReportFilters): string {
	const qs = new URLSearchParams({ month: f.month });
	if (f.technicianId) qs.set("technicianId", f.technicianId);
	if (f.cutoff) qs.set("cutoff", f.cutoff);
	return qs.toString();
}

export default function AttendanceReportPage() {
	const [technicianId, setTechnicianId] = useState<string | null>(null);
	const [month, setMonth] = useState(currentPhMonth());
	const [cutoff, setCutoff] = useState<string | null>("");
	const [isDownloading, setIsDownloading] = useState(false);

	// The filters actually used for the last Generate — kept separate from
	// the live filter inputs above so editing a dropdown after generating
	// doesn't silently change what Download exports. Download always exports
	// what's on screen, not whatever the filters currently say.
	const [generatedFilters, setGeneratedFilters] = useState<ReportFilters | null>(null);

	const { data: technicians = [] } = useQuery<Technician[]>({
		queryKey: ["technicians"],
		queryFn: () => fetchData<Technician[]>("/api/technicians"),
		staleTime: 1000 * 60 * 5,
	});

	const technicianOptions: ComboboxItem[] = [
		{ value: "", label: "All technicians" },
		...technicians.map((t) => ({ value: String(t.id), label: t.name })),
	];

	const {
		data: reportData,
		isFetching: isGenerating,
	} = useQuery<{ rows: ReportRow[] }>({
		queryKey: ["attendance-report-data", generatedFilters],
		queryFn: () =>
			fetchData<{ rows: ReportRow[] }>(
				`/api/attendance/report/data?${buildQueryString(generatedFilters!)}`
			),
		// Only fires once Generate has been clicked, and re-fires whenever
		// generatedFilters changes — no manual refetch() needed (calling
		// refetch() right after setGeneratedFilters would race the state
		// update and reuse the query key from the render that just passed).
		enabled: generatedFilters !== null,
	});

	const handleGenerate = () => {
		if (!month) {
			showAppToast({ message: "Pick a month first", position: "top-right", color: "error" });
			return;
		}
		setGeneratedFilters({ technicianId, month, cutoff: cutoff ?? "" });
	};

	const handleDownload = async () => {
		if (!generatedFilters) return;
		setIsDownloading(true);
		try {
			const res = await fetch(
				apiPath(`/api/attendance/report?${buildQueryString(generatedFilters)}`)
			);
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error || "Failed to generate report.");
			}
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `attendance_${generatedFilters.month}${
				generatedFilters.cutoff ? `_cutoff-${generatedFilters.cutoff}` : ""
			}.xlsx`;
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
		} catch (err) {
			showAppToast({
				message: "Download failed",
				description: err instanceof Error ? err.message : "Please try again.",
				position: "top-right",
				color: "error",
			});
		} finally {
			setIsDownloading(false);
		}
	};

	const rows = reportData?.rows ?? [];

	return (
		<Card className="rounded-2xl border shadow-sm">
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base font-semibold">
					<FileSpreadsheet className="h-5 w-5 text-primary" />
					Technician Attendance Report
				</CardTitle>
				<p className="text-sm text-muted-foreground">
					Time In / Time Out logs with hours rendered, ready for payroll.
					The 1-hour lunch break is deducted automatically.
				</p>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
					<div className="space-y-1">
						<label className="text-sm font-medium">Technician</label>
						<ComboBoxResponsive
							data={technicianOptions}
							placeholder="All technicians"
							selectedValue={technicianId ?? ""}
							onValueChange={(v) => setTechnicianId(v || null)}
							emptyMessage="No technicians found."
						/>
					</div>
					<div className="space-y-1">
						<label className="text-sm font-medium">Month</label>
						<input
							type="month"
							value={month}
							onChange={(e) => setMonth(e.target.value)}
							className="flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-xs outline-none"
						/>
					</div>
					<div className="space-y-1">
						<label className="text-sm font-medium">Payroll Cutoff</label>
						<ComboBoxResponsive
							data={CUTOFF_OPTIONS}
							placeholder="Whole month"
							selectedValue={cutoff ?? ""}
							onValueChange={(v) => setCutoff(v || "")}
							emptyMessage="No options found."
						/>
					</div>
				</div>

				<div className="flex flex-wrap gap-2">
					<Button onClick={handleGenerate} disabled={isGenerating} className="gap-2">
						{isGenerating ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<PlayCircle className="h-4 w-4" />
						)}
						{isGenerating ? "Generating…" : "Generate"}
					</Button>
					<Button
						variant="outline"
						onClick={handleDownload}
						disabled={!generatedFilters || isDownloading}
						className="gap-2"
					>
						{isDownloading ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<Download className="h-4 w-4" />
						)}
						{isDownloading ? "Preparing…" : "Download Excel"}
					</Button>
				</div>

				{generatedFilters && (
					<div className="overflow-x-auto rounded-lg border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Technician</TableHead>
									<TableHead>Itinerary Date</TableHead>
									<TableHead>Time In</TableHead>
									<TableHead>Time Out</TableHead>
									<TableHead>Hours Rendered</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{isGenerating ? (
									<TableRow>
										<TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
											Loading…
										</TableCell>
									</TableRow>
								) : rows.length === 0 ? (
									<TableRow>
										<TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
											No attendance records for these filters.
										</TableCell>
									</TableRow>
								) : (
									rows.map((r, i) => (
										<TableRow key={`${r.technicianId}-${r.itineraryDate}-${i}`}>
											<TableCell>{r.technician}</TableCell>
											<TableCell>{r.itineraryDate}</TableCell>
											<TableCell>{r.timeIn}</TableCell>
											<TableCell>{r.timeOut}</TableCell>
											<TableCell>{r.hoursRendered}</TableCell>
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
