"use client";

import React, { useState } from "react";
import { useMutation, useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Table,
	TableHeader,
	TableBody,
	TableRow,
	TableHead,
	TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import { ComboBoxResponsive, ComboboxItem } from "@/components/ui/combobox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuCheckboxItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Plus,
	Pencil,
	Trash2,
	Search,
	SlidersHorizontal,
	ChevronLeft,
	ChevronRight,
	X,
} from "lucide-react";
import { fetchData } from "@/lib/fetchData";
import { apiPath } from "@/lib/base-path";
import { showAppToast } from "@/components/ui/apptoast";

export type FieldType = "text" | "number" | "date" | "select" | "boolean";
export type DataRow = Record<string, unknown>;

export interface FieldConfig {
	name: string;
	label: string;
	type: FieldType;
	required?: boolean;
	// For "select" fields: either a static list, or options loaded from
	// another master-data endpoint (e.g. clients for a location's dropdown).
	options?: ComboboxItem[];
	optionsQueryKey?: string[];
	optionsEndpoint?: string;
	optionsMap?: (row: DataRow) => ComboboxItem; // maps a raw API row to {value,label}
	placeholder?: string;
	// If true, this field is only editable at create time (e.g. priorities.id).
	immutable?: boolean;
	/** Initial value (as a form-state string) when creating a new record.
	 * Mainly for "boolean" fields, e.g. defaulting isActive to "true". */
	defaultValue?: string;
}

export interface ColumnConfig {
	key: string;
	label: string;
	render?: (row: DataRow) => React.ReactNode;
	/** Tailwind min-width for this column, e.g. "min-w-[160px]". Wide tables
	 * scroll horizontally rather than squeezing every column to illegibility. */
	minWidth?: string;
	/** Hide by default; the user can re-enable it from the Columns menu. */
	hiddenByDefault?: boolean;
}

/** A named filter box rendered above the table. `param` is the query-string
 * key sent to the list endpoint, so the API decides what it means. */
export interface FilterConfig {
	param: string;
	label: string;
	placeholder?: string;
}

/** Endpoints may return either a bare array (all rows — paginated in the
 * browser) or this envelope (already paginated by the server). */
interface ListEnvelope {
	rows: DataRow[];
	total: number;
}
type ListResponse = DataRow[] | ListEnvelope;

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

interface MasterDataManagerProps {
	title: string;
	description?: string;
	listEndpoint: string;
	itemEndpoint: (id: number | string) => string;
	idField?: string;
	columns: ColumnConfig[];
	fields: FieldConfig[];
	displayName: (row: DataRow) => string;
	searchable?: boolean;
	headerExtra?: React.ReactNode;
	/** Named filter boxes. When provided, these replace the single search box. */
	filters?: FilterConfig[];
	/** Rows per page on first render. */
	defaultPageSize?: number;
	/** Extra per-row controls, rendered in the pinned Actions column ahead
	 * of the built-in Edit/Delete buttons. Lets a module add an action that
	 * isn't generic CRUD (e.g. transferring a printer) without every other
	 * grid inheriting it. */
	rowActions?: (row: DataRow) => React.ReactNode;
}

export function MasterDataManager({
	title,
	description,
	listEndpoint,
	itemEndpoint,
	idField = "id",
	columns,
	fields,
	displayName,
	searchable = true,
	headerExtra,
	filters,
	defaultPageSize = 25,
	rowActions,
}: MasterDataManagerProps) {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [isFormOpen, setIsFormOpen] = useState(false);
	const [editingRow, setEditingRow] = useState<DataRow | null>(null);
	const [formValues, setFormValues] = useState<Record<string, string>>({});
	const [deleteTarget, setDeleteTarget] = useState<DataRow | null>(null);

	// One value per named filter, keyed by its query param.
	const [filterValues, setFilterValues] = useState<Record<string, string>>({});
	// Typing shouldn't fire a request per keystroke — this trails the live
	// inputs by a beat and is what actually goes into the query key.
	const [debouncedFilters, setDebouncedFilters] = useState<Record<string, string>>({});
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(defaultPageSize);
	const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(
		() => new Set(columns.filter((c) => c.hiddenByDefault).map((c) => c.key))
	);

	React.useEffect(() => {
		const t = setTimeout(() => {
			setDebouncedFilters(filterValues);
			setDebouncedSearch(search);
		}, 300);
		return () => clearTimeout(t);
	}, [filterValues, search]);

	// Any change to what's being filtered invalidates the current page number.
	React.useEffect(() => {
		setPage(1);
	}, [debouncedFilters, debouncedSearch, pageSize]);

	const activeFilterCount =
		Object.values(filterValues).filter((v) => v.trim() !== "").length +
		(search.trim() ? 1 : 0);

	const queryString = React.useMemo(() => {
		const qs = new URLSearchParams();
		if (debouncedSearch.trim()) qs.set("search", debouncedSearch.trim());
		for (const [k, v] of Object.entries(debouncedFilters)) {
			if (v.trim()) qs.set(k, v.trim());
		}
		qs.set("page", String(page));
		qs.set("pageSize", String(pageSize));
		return qs.toString();
	}, [debouncedSearch, debouncedFilters, page, pageSize]);

	const { data: response, isLoading, isFetching } = useQuery<ListResponse>({
		queryKey: [listEndpoint, queryString],
		queryFn: () => fetchData<ListResponse>(`${listEndpoint}?${queryString}`),
		// Keeps the previous page on screen while the next one loads instead
		// of flashing an empty table on every page change.
		placeholderData: (prev) => prev,
	});

	// Endpoints that ignore ?page/?pageSize still return the full array; those
	// get sliced here so every grid paginates regardless of server support.
	const serverPaged = !!response && !Array.isArray(response);
	const allRows: DataRow[] = serverPaged
		? (response as ListEnvelope).rows ?? []
		: ((response as DataRow[]) ?? []);
	const total = serverPaged ? (response as ListEnvelope).total ?? 0 : allRows.length;
	const rows = serverPaged
		? allRows
		: allRows.slice((page - 1) * pageSize, page * pageSize);

	const pageCount = Math.max(1, Math.ceil(total / pageSize));
	const firstRowIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
	const lastRowIndex = Math.min(page * pageSize, total);

	const visibleColumns = columns.filter((c) => !hiddenColumns.has(c.key));

	const toggleColumn = (key: string) =>
		setHiddenColumns((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});

	const clearFilters = () => {
		setFilterValues({});
		setSearch("");
	};

	// Preload options for any select fields from their own endpoints. Using
	// useQueries (a single hook call) rather than calling useQuery inside a
	// .map() keeps this valid regardless of how many select fields a given
	// instance has — React Hooks can't be called conditionally/in a loop.
	const selectFields = fields.filter((f) => f.type === "select" && f.optionsEndpoint);
	const optionResults = useQueries({
		queries: selectFields.map((f) => ({
			queryKey: f.optionsQueryKey ?? [f.optionsEndpoint!],
			queryFn: () => fetchData<DataRow[]>(f.optionsEndpoint!),
			enabled: isFormOpen,
		})),
	});

	const optionsFor = (field: FieldConfig): ComboboxItem[] => {
		if (field.options) return field.options;
		const idx = selectFields.findIndex((f) => f.name === field.name);
		const data = idx >= 0 ? optionResults[idx]?.data : undefined;
		if (!data) return [];
		return data.map(
			field.optionsMap ??
				((r) => ({ value: String(r.id), label: String(r.name) }))
		);
	};

	const openCreate = () => {
		setEditingRow(null);
		const defaults: Record<string, string> = {};
		fields.forEach((f) => {
			if (f.defaultValue != null) defaults[f.name] = f.defaultValue;
		});
		setFormValues(defaults);
		setIsFormOpen(true);
	};

	const openEdit = (row: DataRow) => {
		setEditingRow(row);
		const values: Record<string, string> = {};
		fields.forEach((f) => {
			const v = row[f.name];
			values[f.name] = v != null ? String(v) : "";
		});
		setFormValues(values);
		setIsFormOpen(true);
	};

	const { mutate: saveRecord, isPending: isSaving } = useMutation({
		mutationFn: async () => {
			const body: Record<string, unknown> = {};
			for (const f of fields) {
				if (editingRow && f.immutable) continue;
				const raw = formValues[f.name] ?? "";
				if (f.type === "number" || f.type === "select") {
					body[f.name] = raw === "" ? undefined : Number(raw);
				} else if (f.type === "boolean") {
					body[f.name] = raw === "true";
				} else {
					body[f.name] = raw;
				}
			}
			const url = editingRow
				? itemEndpoint(editingRow[idField] as number | string)
				: listEndpoint;
			const method = editingRow ? "PATCH" : "POST";
			const res = await fetch(apiPath(url), {
				method,
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error || "Save failed.");
			}
			return res.json();
		},
		onSuccess: () => {
			showAppToast({
				message: editingRow ? "Record updated" : "Record created",
				position: "top-right",
				color: "success",
			});
			queryClient.invalidateQueries({ queryKey: [listEndpoint] });
			setIsFormOpen(false);
		},
		onError: (error: Error) => {
			showAppToast({
				message: "Save failed",
				description: error.message,
				position: "top-right",
				color: "error",
			});
		},
	});

	const { mutate: deleteRecordMutation, isPending: isDeleting } = useMutation({
		mutationFn: async (row: DataRow) => {
			const res = await fetch(apiPath(itemEndpoint(row[idField] as number | string)), {
				method: "DELETE",
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error || "Delete failed.");
			}
			return res.json();
		},
		onSuccess: () => {
			showAppToast({ message: "Record deleted", position: "top-right", color: "success" });
			queryClient.invalidateQueries({ queryKey: [listEndpoint] });
			setDeleteTarget(null);
		},
		onError: (error: Error) => {
			showAppToast({
				message: "Cannot delete",
				description: error.message,
				position: "top-right",
				color: "error",
			});
			setDeleteTarget(null);
		},
	});

	return (
		<Card className="rounded-xl border shadow-none">
			<CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
				<div>
					<CardTitle className="text-sm font-semibold">{title}</CardTitle>
					{description && (
						<p className="text-xs text-muted-foreground">{description}</p>
					)}
				</div>
					<div className="flex items-center gap-2">
					{headerExtra}
					<Button size="sm" onClick={openCreate}>
						<Plus className="h-4 w-4" />
						Add
					</Button>
				</div>
			</CardHeader>
			<CardContent className="space-y-3">
				{(filters?.length || searchable) && (
					<div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
						{filters?.length ? (
							<div className="grid flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
								{filters.map((f) => (
									<div key={f.param} className="space-y-1">
										<label className="text-xs font-medium text-muted-foreground">
											{f.label}
										</label>
										<div className="relative">
											<Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
											<Input
												className="h-9 pl-8 text-sm"
												placeholder={f.placeholder ?? f.label}
												value={filterValues[f.param] ?? ""}
												onChange={(e) =>
													setFilterValues((prev) => ({
														...prev,
														[f.param]: e.target.value,
													}))
												}
											/>
										</div>
									</div>
								))}
							</div>
						) : (
							searchable && (
								<div className="relative flex-1">
									<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
									<Input
										placeholder="Search…"
										className="pl-8"
										value={search}
										onChange={(e) => setSearch(e.target.value)}
									/>
								</div>
							)
						)}

						<div className="flex shrink-0 items-center gap-2">
							{activeFilterCount > 0 && (
								<Button variant="ghost" size="sm" onClick={clearFilters}>
									<X className="h-4 w-4" />
									Clear
								</Button>
							)}
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="outline" size="sm">
										<SlidersHorizontal className="h-4 w-4" />
										Columns
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="w-48">
									<DropdownMenuLabel>Visible columns</DropdownMenuLabel>
									{columns.map((c) => (
										<DropdownMenuCheckboxItem
											key={c.key}
											checked={!hiddenColumns.has(c.key)}
											onCheckedChange={() => toggleColumn(c.key)}
											onSelect={(e) => e.preventDefault()}
										>
											{c.label}
										</DropdownMenuCheckboxItem>
									))}
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					</div>
				)}

				{/* The table scrolls horizontally instead of compressing columns.
				    `w-max` lets it grow past the container; the Actions column is
				    pinned right so Edit/Delete stay reachable mid-scroll. */}
				<div className="relative overflow-x-auto rounded-lg border">
					<Table className="w-max min-w-full">
						<TableHeader>
							<TableRow>
								{visibleColumns.map((c) => (
									<TableHead
										key={c.key}
										className={`whitespace-nowrap ${c.minWidth ?? ""}`}
									>
										{c.label}
									</TableHead>
								))}
								<TableHead className="sticky right-0 z-10 bg-card text-right shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.15)]">
									Actions
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{isLoading ? (
								<TableRow>
									<TableCell colSpan={visibleColumns.length + 1} className="text-center text-sm text-muted-foreground">
										Loading…
									</TableCell>
								</TableRow>
							) : rows.length === 0 ? (
								<TableRow>
									<TableCell colSpan={visibleColumns.length + 1} className="text-center text-sm text-muted-foreground">
										{activeFilterCount > 0
											? "No records match these filters."
											: "No records found."}
									</TableCell>
								</TableRow>
							) : (
								rows.map((row) => (
									<TableRow key={String(row[idField])}>
										{visibleColumns.map((c) => (
											<TableCell
												key={c.key}
												className={`whitespace-nowrap ${c.minWidth ?? ""}`}
											>
												{c.render
													? c.render(row)
													: row[c.key] != null
													? String(row[c.key])
													: "—"}
											</TableCell>
										))}
										<TableCell className="sticky right-0 z-10 bg-card text-right shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.15)]">
											{rowActions?.(row)}
											<Button variant="ghost" size="icon" onClick={() => openEdit(row)}>
												<Pencil className="h-4 w-4" />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												onClick={() => setDeleteTarget(row)}
											>
												<Trash2 className="h-4 w-4 text-destructive" />
											</Button>
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</div>

				<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
					<p className="text-xs text-muted-foreground">
						{total === 0
							? "No records"
							: `Showing ${firstRowIndex}–${lastRowIndex} of ${total}`}
						{isFetching && !isLoading && " · updating…"}
					</p>
					<div className="flex items-center gap-2">
						<select
							className="h-8 rounded-md border bg-background px-2 text-xs"
							value={pageSize}
							onChange={(e) => setPageSize(Number(e.target.value))}
							aria-label="Rows per page"
						>
							{PAGE_SIZE_OPTIONS.map((n) => (
								<option key={n} value={n}>
									{n} / page
								</option>
							))}
						</select>
						<Button
							variant="outline"
							size="icon"
							className="h-8 w-8"
							onClick={() => setPage((p) => Math.max(1, p - 1))}
							disabled={page <= 1}
							aria-label="Previous page"
						>
							<ChevronLeft className="h-4 w-4" />
						</Button>
						<span className="text-xs text-muted-foreground">
							Page {page} of {pageCount}
						</span>
						<Button
							variant="outline"
							size="icon"
							className="h-8 w-8"
							onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
							disabled={page >= pageCount}
							aria-label="Next page"
						>
							<ChevronRight className="h-4 w-4" />
						</Button>
					</div>
				</div>
			</CardContent>

			<Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{editingRow ? `Edit ${title}` : `Add ${title}`}</DialogTitle>
					</DialogHeader>
					<div className="grid gap-4 py-2">
						{fields.map((f) => {
							const disabled = !!(editingRow && f.immutable);
							if (f.type === "boolean") {
								return (
									<div
										key={f.name}
										className="flex items-center justify-between rounded-lg border px-3 py-2"
									>
										<label className="text-sm font-medium">{f.label}</label>
										<Switch
											checked={formValues[f.name] === "true"}
											disabled={disabled}
											onCheckedChange={(checked) =>
												setFormValues((prev) => ({
													...prev,
													[f.name]: checked ? "true" : "false",
												}))
											}
										/>
									</div>
								);
							}
							if (f.type === "select") {
								return (
									<div key={f.name} className="space-y-1">
										<label className="text-sm font-medium">
											{f.label}
											{f.required && " *"}
										</label>
										<ComboBoxResponsive
											data={optionsFor(f)}
											placeholder={f.placeholder ?? `Select ${f.label.toLowerCase()}`}
											selectedValue={formValues[f.name] ?? null}
											onValueChange={(v) =>
												setFormValues((prev) => ({ ...prev, [f.name]: v ?? "" }))
											}
											emptyMessage="No options found."
											disabled={disabled}
										/>
									</div>
								);
							}
							return (
								<div key={f.name} className="space-y-1">
									<label className="text-sm font-medium">
										{f.label}
										{f.required && " *"}
									</label>
									<Input
										type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
										value={formValues[f.name] ?? ""}
										disabled={disabled}
										onChange={(e) =>
											setFormValues((prev) => ({ ...prev, [f.name]: e.target.value }))
										}
									/>
								</div>
							);
						})}
					</div>
					<DialogFooter>
						<Button onClick={() => saveRecord()} disabled={isSaving}>
							{isSaving ? "Saving…" : editingRow ? "Save Changes" : "Create"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete record?</DialogTitle>
						<DialogDescription>
							{deleteTarget && `This will permanently delete "${displayName(deleteTarget)}". This cannot be undone.`}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDeleteTarget(null)}>
							Cancel
						</Button>
						<Button
							variant="destructive"
							disabled={isDeleting}
							onClick={() => deleteTarget && deleteRecordMutation(deleteTarget)}
						>
							{isDeleting ? "Deleting…" : "Delete"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</Card>
	);
}
