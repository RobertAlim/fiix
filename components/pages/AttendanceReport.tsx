"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
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
import { Badge } from "@/components/ui/badge";
import { ComboBoxResponsive, ComboboxItem } from "@/components/ui/combobox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Download, FileSpreadsheet, Loader2, PlayCircle, Pencil, Lock } from "lucide-react";
import { fetchData } from "@/lib/fetchData";
import { apiPath } from "@/lib/base-path";
import { showAppToast } from "@/components/ui/apptoast";
import { useUserStore } from "@/state/userStore";
import { cn } from "@/lib/utils";

/**
 * Same markup/classes as `TableRow` from @/components/ui/table, but with a
 * forwarded ref. `TableRow` itself is a plain function component (not
 * `React.forwardRef`), so it can't be the direct child of a Radix
 * `PopoverTrigger asChild` — Radix needs a real DOM ref on the trigger to
 * anchor the popover, and a ref handed to a non-forwarding function
 * component is silently dropped (with a dev warning), leaving the popover
 * unanchored. Kept local to this file rather than changing the shared
 * `TableRow` (used all over the app) just for this one use.
 */
const ClickableTableRow = React.forwardRef<
	HTMLTableRowElement,
	React.ComponentProps<"tr">
>(function ClickableTableRow({ className, ...props }, ref) {
	return (
		<tr
			ref={ref}
			data-slot="table-row"
			className={cn(
				"hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors",
				className
			)}
			{...props}
		/>
	);
});

interface Person {
	id: number;
	name: string;
	role: string | null;
}

interface ReportRow {
	/** technicianAttendance.id — this specific record, not the person. */
	id: number;
	technicianId: number;
	technician: string;
	role: string | null;
	workDate: string;
	itineraryDate: string;
	timeInIso: string;
	timeOutIso: string | null;
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
	role: string | null;
	month: string;
	cutoff: string;
}

function buildQueryString(f: ReportFilters): string {
	const qs = new URLSearchParams({ month: f.month });
	if (f.technicianId) qs.set("technicianId", f.technicianId);
	if (f.role) qs.set("role", f.role);
	if (f.cutoff) qs.set("cutoff", f.cutoff);
	return qs.toString();
}

/** "HH:mm" (24-hour) for the given UTC ISO instant, in Asia/Manila local
 * time — what the Sign Out edit popover's <input type="time"> needs to
 * prefill. `hourCycle: "h23"` is deliberate: without it, some ICU builds
 * render midnight as "24:00" instead of "00:00" for hour12:false /
 * 2-digit hour formatting, which a plain <input type="time"> rejects. */
function toManilaHHmm(iso: string | null): string {
	if (!iso) return "";
	const parts = new Intl.DateTimeFormat("en-GB", {
		timeZone: "Asia/Manila",
		hourCycle: "h23",
		hour: "2-digit",
		minute: "2-digit",
	}).formatToParts(new Date(iso));
	const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
	const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
	return `${hour}:${minute}`;
}

/**
 * Mirrors the server-side rule in
 * app/api/attendance/report/[id]/time-out/route.ts exactly — this is only
 * ever a courtesy (the route re-checks everything itself), but it's what
 * lets the popover show the right message before a save is even attempted.
 */
function canEditSignOut(row: ReportRow, currentUserRole: string | null | undefined): boolean {
	if (currentUserRole === "Super Admin") return true;
	if (currentUserRole === "Admin") {
		return row.role === "Technician" && row.timeOutIso !== null;
	}
	return false;
}

export default function AttendanceReportPage() {
	const { users } = useUserStore();
	const currentUserRole = users?.role ?? null;
	const [technicianId, setTechnicianId] = useState<string | null>(null);
	const [role, setRole] = useState<string | null>(null);
	const [month, setMonth] = useState(currentPhMonth());
	const [cutoff, setCutoff] = useState<string | null>("");
	const [isDownloading, setIsDownloading] = useState(false);

	// The filters actually used for the last Generate — kept separate from
	// the live filter inputs above so editing a dropdown after generating
	// doesn't silently change what Download exports. Download always exports
	// what's on screen, not whatever the filters currently say.
	const [generatedFilters, setGeneratedFilters] = useState<ReportFilters | null>(null);

	// Everyone who has AT LEAST ONE attendance record, any role — not
	// /api/technicians (which only ever returns Technicians, for the
	// Schedule-assignment picker elsewhere). This is what makes an Admin
	// or Scheduler who's used Timekeep actually show up here.
	const { data: people = [] } = useQuery<Person[]>({
		queryKey: ["attendance-report-people"],
		queryFn: () => fetchData<Person[]>("/api/attendance/report/people"),
		staleTime: 1000 * 60 * 5,
	});

	const personOptions: ComboboxItem[] = [
		{ value: "", label: "Everyone" },
		...people.map((p) => ({
			value: String(p.id),
			label: p.role ? `${p.name} (${p.role})` : p.name,
		})),
	];

	// Role filter options are derived from whichever roles actually appear
	// in the attendance data, rather than the full static role list — a
	// role filter offering "Scheduler" when no Scheduler has ever timed in
	// would just be a dead end.
	const availableRoles = Array.from(
		new Set(people.map((p) => p.role).filter((r): r is string => !!r))
	).sort();
	const roleOptions: ComboboxItem[] = [
		{ value: "", label: "All roles" },
		...availableRoles.map((r) => ({ value: r, label: r })),
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
		setGeneratedFilters({ technicianId, role, month, cutoff: cutoff ?? "" });
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
					Attendance Report
				</CardTitle>
				<p className="text-sm text-muted-foreground">
					Time In / Time Out logs with hours rendered, ready for payroll —
					covers Technicians in the field and Admin/Scheduler staff using
					Timekeep alike. The 1-hour lunch break is deducted automatically.
				</p>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<div className="space-y-1">
						<label className="text-sm font-medium">Person</label>
						<ComboBoxResponsive
							data={personOptions}
							placeholder="Everyone"
							selectedValue={technicianId ?? ""}
							onValueChange={(v) => setTechnicianId(v || null)}
							emptyMessage="No one has attendance records yet."
						/>
					</div>
					<div className="space-y-1">
						<label className="text-sm font-medium">Role</label>
						<ComboBoxResponsive
							data={roleOptions}
							placeholder="All roles"
							selectedValue={role ?? ""}
							onValueChange={(v) => setRole(v || null)}
							emptyMessage="No roles found."
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
									<TableHead>Name</TableHead>
									<TableHead>Role</TableHead>
									<TableHead>Itinerary Date</TableHead>
									<TableHead>Time In</TableHead>
									<TableHead>Time Out</TableHead>
									<TableHead>Hours Rendered</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{isGenerating ? (
									<TableRow>
										<TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
											Loading…
										</TableCell>
									</TableRow>
								) : rows.length === 0 ? (
									<TableRow>
										<TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
											No attendance records for these filters.
										</TableCell>
									</TableRow>
								) : (
									rows.map((r) => (
										<AttendanceRow
											key={r.id}
											row={r}
											currentUserRole={currentUserRole}
										/>
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

/**
 * One Attendance Report row. The entire row is the Popover trigger — per
 * requirement 1, clicking anywhere on the row opens the Sign Out editor,
 * not just some small icon. `canEditSignOut` decides what's actually shown
 * inside: an editable time input, or an explanation of why this specific
 * record can't be edited by this user. Either way the popover opens, so
 * "clearly reflect whether the current user is authorized" (requirement 4)
 * always has somewhere to say so.
 *
 * The real enforcement is server-side, in
 * app/api/attendance/report/[id]/time-out/route.ts — this is only ever a
 * courtesy, same as every other role gate in this codebase.
 */
function AttendanceRow({
	row,
	currentUserRole,
}: {
	row: ReportRow;
	currentUserRole: string | null;
}) {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [draftTime, setDraftTime] = useState(toManilaHHmm(row.timeOutIso));

	const editable = canEditSignOut(row, currentUserRole);

	const { mutate: saveTimeOut, isPending } = useMutation({
		mutationFn: async () => {
			const res = await fetch(apiPath(`/api/attendance/report/${row.id}/time-out`), {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ time: draftTime }),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				throw new Error(data.error || "Could not update Sign Out.");
			}
			return data as { id: number; timeOutIso: string; timeOut: string; hoursRendered: string };
		},
		onSuccess: (updated) => {
			showAppToast({
				message: "Sign Out updated",
				position: "top-right",
				color: "success",
			});
			// Patch the cached grid in place — same reasoning as the Related
			// Issues notes editor: a full refetch would re-run the current
			// filters and could reorder/drop rows out from under the user
			// right as they save, when all that actually changed is one
			// cell. Partial queryKey match (no `exact`) hits the cache entry
			// for whatever `generatedFilters` produced this row.
			queryClient.setQueriesData<{ rows: ReportRow[] }>(
				{ queryKey: ["attendance-report-data"] },
				(old) =>
					old
						? {
								...old,
								rows: old.rows.map((r) =>
									r.id === updated.id
										? {
												...r,
												timeOutIso: updated.timeOutIso,
												timeOut: updated.timeOut,
												hoursRendered: updated.hoursRendered,
											}
										: r
								),
							}
						: old
			);
			setOpen(false);
		},
		onError: (err) => {
			showAppToast({
				message: "Couldn't update Sign Out",
				description: err instanceof Error ? err.message : "Please try again.",
				position: "top-right",
				color: "error",
			});
		},
	});

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				// Re-sync the draft from the current cached value every time the
				// popover opens, so a stale edit from a previously cancelled
				// session never clobbers a newer value on save.
				if (next) setDraftTime(toManilaHHmm(row.timeOutIso));
				setOpen(next);
			}}
		>
			<PopoverTrigger asChild>
				<ClickableTableRow
					className={cn("cursor-pointer", open && "bg-muted/50")}
				>
					<TableCell className="font-medium">{row.technician}</TableCell>
					<TableCell>
						{row.role ? (
							<Badge variant="outline">{row.role}</Badge>
						) : (
							<span className="text-muted-foreground">—</span>
						)}
					</TableCell>
					<TableCell>{row.itineraryDate}</TableCell>
					<TableCell>{row.timeIn}</TableCell>
					<TableCell>
						<span className="inline-flex items-center gap-1.5">
							{row.timeOut}
							{editable ? (
								<Pencil className="h-3 w-3 shrink-0 opacity-50" />
							) : (
								<Lock className="h-3 w-3 shrink-0 opacity-40" />
							)}
						</span>
					</TableCell>
					<TableCell>{row.hoursRendered}</TableCell>
				</ClickableTableRow>
			</PopoverTrigger>
			<PopoverContent
				className="w-72"
				// Radix portals this out of the table's DOM subtree, but React
				// still bubbles synthetic events through the COMPONENT tree —
				// so a click or keypress in here would otherwise also register
				// as a click on the row underneath (which, for a Popover
				// trigger that's an entire <tr>, would just reopen the same
				// popover, but stopping it here keeps the behavior obvious and
				// matches the established pattern elsewhere in this codebase).
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
			>
				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<label className="text-sm font-medium">Sign Out</label>
						<span className="text-xs text-muted-foreground">
							{row.technician} · {row.itineraryDate}
						</span>
					</div>

					{!editable ? (
						<p className="rounded-md bg-muted p-2.5 text-sm text-muted-foreground">
							{currentUserRole === "Admin" && row.role !== "Technician"
								? "Admins can only edit Sign Out for Technician attendance records."
								: currentUserRole === "Admin" && !row.timeOutIso
									? "This record has no Sign Out value yet — only Super Admin can set one from blank."
									: "You are not authorized to edit this Sign Out value."}
						</p>
					) : (
						<>
							<input
								type="time"
								value={draftTime}
								onChange={(e) => setDraftTime(e.target.value)}
								disabled={isPending}
								autoFocus
								className="flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-xs outline-none"
							/>
							<p className="text-xs text-muted-foreground">
								Asia/Manila time, for {row.itineraryDate}.
							</p>
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
									onClick={() => saveTimeOut()}
									disabled={
										isPending ||
										!draftTime ||
										draftTime === toManilaHHmm(row.timeOutIso)
									}
								>
									{isPending ? "Saving…" : "Save"}
								</Button>
							</div>
						</>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
