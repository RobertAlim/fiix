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
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import { ComboBoxResponsive, ComboboxItem } from "@/components/ui/combobox";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { fetchData } from "@/lib/fetchData";
import { showAppToast } from "@/components/ui/apptoast";

export type FieldType = "text" | "number" | "date" | "select";
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
}

export interface ColumnConfig {
	key: string;
	label: string;
	render?: (row: DataRow) => React.ReactNode;
}

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
}: MasterDataManagerProps) {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [isFormOpen, setIsFormOpen] = useState(false);
	const [editingRow, setEditingRow] = useState<DataRow | null>(null);
	const [formValues, setFormValues] = useState<Record<string, string>>({});
	const [deleteTarget, setDeleteTarget] = useState<DataRow | null>(null);

	const { data: rows = [], isLoading } = useQuery<DataRow[]>({
		queryKey: [listEndpoint, search],
		queryFn: () =>
			fetchData<DataRow[]>(
				`${listEndpoint}${search ? `?search=${encodeURIComponent(search)}` : ""}`
			),
	});

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
		setFormValues({});
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
				} else {
					body[f.name] = raw;
				}
			}
			const url = editingRow
				? itemEndpoint(editingRow[idField] as number | string)
				: listEndpoint;
			const method = editingRow ? "PATCH" : "POST";
			const res = await fetch(url, {
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
			const res = await fetch(itemEndpoint(row[idField] as number | string), {
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
				{searchable && (
					<div className="relative">
						<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
						<Input
							placeholder="Search…"
							className="pl-8"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
						/>
					</div>
				)}

				<div className="overflow-x-auto rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								{columns.map((c) => (
									<TableHead key={c.key}>{c.label}</TableHead>
								))}
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{isLoading ? (
								<TableRow>
									<TableCell colSpan={columns.length + 1} className="text-center text-sm text-muted-foreground">
										Loading…
									</TableCell>
								</TableRow>
							) : rows.length === 0 ? (
								<TableRow>
									<TableCell colSpan={columns.length + 1} className="text-center text-sm text-muted-foreground">
										No records found.
									</TableCell>
								</TableRow>
							) : (
								rows.map((row) => (
									<TableRow key={String(row[idField])}>
										{columns.map((c) => (
											<TableCell key={c.key}>
												{c.render
													? c.render(row)
													: row[c.key] != null
													? String(row[c.key])
													: "—"}
											</TableCell>
										))}
										<TableCell className="text-right">
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
			</CardContent>

			<Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{editingRow ? `Edit ${title}` : `Add ${title}`}</DialogTitle>
					</DialogHeader>
					<div className="grid gap-4 py-2">
						{fields.map((f) => {
							const disabled = !!(editingRow && f.immutable);
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
