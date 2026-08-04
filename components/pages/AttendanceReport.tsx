"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ComboBoxResponsive, ComboboxItem } from "@/components/ui/combobox";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { fetchData } from "@/lib/fetchData";
import { apiPath } from "@/lib/base-path";
import { showAppToast } from "@/components/ui/apptoast";

interface Technician {
	id: number;
	name: string;
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

export default function AttendanceReportPage() {
	const [technicianId, setTechnicianId] = useState<string | null>(null);
	const [month, setMonth] = useState(currentPhMonth());
	const [cutoff, setCutoff] = useState<string | null>("");
	const [isDownloading, setIsDownloading] = useState(false);

	const { data: technicians = [] } = useQuery<Technician[]>({
		queryKey: ["technicians"],
		queryFn: () => fetchData<Technician[]>("/api/technicians"),
		staleTime: 1000 * 60 * 5,
	});

	const technicianOptions: ComboboxItem[] = [
		{ value: "", label: "All technicians" },
		...technicians.map((t) => ({ value: String(t.id), label: t.name })),
	];

	const handleDownload = async () => {
		if (!month) {
			showAppToast({
				message: "Pick a month first",
				position: "top-right",
				color: "error",
			});
			return;
		}
		setIsDownloading(true);
		try {
			const qs = new URLSearchParams({ month });
			if (technicianId) qs.set("technicianId", technicianId);
			if (cutoff) qs.set("cutoff", cutoff);

			const res = await fetch(apiPath(`/api/attendance/report?${qs.toString()}`));
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error || "Failed to generate report.");
			}
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `attendance_${month}${cutoff ? `_cutoff-${cutoff}` : ""}.xlsx`;
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

				<Button onClick={handleDownload} disabled={isDownloading} className="gap-2">
					{isDownloading ? (
						<Loader2 className="h-4 w-4 animate-spin" />
					) : (
						<Download className="h-4 w-4" />
					)}
					{isDownloading ? "Generating…" : "Download Excel"}
				</Button>
			</CardContent>
		</Card>
	);
}
