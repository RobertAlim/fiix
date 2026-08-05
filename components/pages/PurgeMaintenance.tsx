"use client";

// components/pages/PurgeMaintenance.tsx
//
// Admin-only, temporary migration tool: recreate a historical maintenance
// record on behalf of a Technician, for data that predates (or was missed
// by) the normal field workflow. Three steps in one Dialog:
//   1. Technician / Client / Location / Maintenance Date
//   2. Pick the printer (card grid) — printers deployed at that client+location
//   3. The maintenance form itself, pre-filled from the picked printer
//
// Deliberately NOT the same component as the Technician-facing Maintenance
// page: that one is built around QR scanning, mandatory GPS capture, camera
// nozzle checks, and offline-first sync — none of which apply to an Admin
// backfilling desk-side. It posts to a separate route (no GPS requirement)
// and never creates a GPS row, which is what makes the printed report
// correctly omit "GPS Verified Location" for these records.
import React, { useEffect, useMemo, useState } from "react";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import Select from "react-select";
import { format } from "date-fns";

import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ComboBoxResponsive, ComboboxItem } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Loader2, Printer as PrinterIcon, ArrowLeft, History } from "lucide-react";

import { fetchData } from "@/lib/fetchData";
import { apiPath } from "@/lib/base-path";
import { showAppToast } from "@/components/ui/apptoast";
import {
	maintainFormSchema,
	type MaintainFormData,
} from "@/validation/maintainSchema";

type Item = { label: string; value: string };

interface Technician {
	id: number;
	name: string;
}
interface Client {
	id: number;
	name: string;
}
interface Location {
	id: number;
	name: string;
	clientId: number;
}
interface PurgePrinter {
	printerId: number;
	deploymentId: number;
	serialNo: string;
	modelId: number;
	model: string;
	departmentId: number;
	department: string;
}

const EMPTY_PRINTERS: PurgePrinter[] = [];

type Step = 1 | 2 | 3;

export default function PurgeMaintenancePage({ onClose }: { onClose: () => void }) {
	const [open, setOpen] = useState(true);
	const [step, setStep] = useState<Step>(1);

	// Step 1 selections
	const [technicianId, setTechnicianId] = useState<string | null>(null);
	const [clientId, setClientId] = useState<string | null>(null);
	const [locationId, setLocationId] = useState<string | null>(null);
	const [date, setDate] = useState<Date | undefined>(undefined);

	// Step 2 selection
	const [selectedPrinter, setSelectedPrinter] = useState<PurgePrinter | null>(null);

	const handleClose = () => {
		setOpen(false);
		onClose();
	};

	// --- Reference data -------------------------------------------------
	const { data: technicians = [] } = useQuery<Technician[]>({
		queryKey: ["technicians"],
		queryFn: () => fetchData<Technician[]>("/api/technicians"),
		staleTime: 1000 * 60 * 5,
	});
	const { data: clients = [] } = useQuery<Client[]>({
		queryKey: ["clients"],
		queryFn: () => fetchData<Client[]>("/api/clients"),
		staleTime: 1000 * 60 * 5,
	});
	const { data: locations = [] } = useQuery<Location[]>({
		queryKey: ["locations"],
		queryFn: () => fetchData<Location[]>("/api/locations"),
		staleTime: 1000 * 60 * 5,
	});
	const { data: parts = [] } = useQuery<Item[]>({
		queryKey: ["dropdown-parts"],
		queryFn: () => fetchData<Item[]>("/api/dropdown/parts"),
		staleTime: 1000 * 60 * 5,
	});
	const { data: statusOptions = [] } = useQuery<Item[]>({
		queryKey: ["dropdown-status"],
		queryFn: () => fetchData<Item[]>("/api/dropdown/status"),
		staleTime: 1000 * 60 * 5,
	});

	const technicianOptions: ComboboxItem[] = technicians.map((t) => ({
		value: String(t.id),
		label: t.name,
	}));
	const clientOptions: ComboboxItem[] = clients.map((c) => ({
		value: String(c.id),
		label: c.name,
	}));
	// Locations narrow to the selected client, same cascading pattern used
	// on the Schedule page.
	const locationOptions: ComboboxItem[] = useMemo(
		() =>
			locations
				.filter((loc) => !clientId || String(loc.clientId) === clientId)
				.map((loc) => ({ value: String(loc.id), label: loc.name })),
		[locations, clientId]
	);

	// Changing the client invalidates whatever location was picked for the
	// previous one.
	useEffect(() => {
		setLocationId(null);
	}, [clientId]);

	const scheduledAt = date ? format(date, "yyyy-MM-dd") : undefined;

	// --- Step 2: printers at the chosen client+location -----------------
	const {
		data: printersData,
		isFetching: isLoadingPrinters,
		refetch: refetchPrinters,
	} = useQuery<PurgePrinter[]>({
		queryKey: ["purge-maintenance-printers", clientId, locationId],
		queryFn: () =>
			fetchData<PurgePrinter[]>(
				`/api/admin/purge-maintenance/printers?clientId=${clientId}&locationId=${locationId}`
			),
		enabled: false,
	});
	const printers = printersData ?? EMPTY_PRINTERS;

	const canFindPrinters = !!technicianId && !!clientId && !!locationId && !!scheduledAt;

	const handleFindPrinters = async () => {
		await refetchPrinters();
		setStep(2);
	};

	// --- Step 3: signatories for the chosen client -----------------------
	const { data: signatoryOptions = [] } = useQuery<Item[]>({
		queryKey: ["signatories", clientId],
		queryFn: () => fetchData<Item[]>(`/api/signatories?clientId=${clientId}`),
		enabled: !!clientId && step === 3,
	});

	const {
		control,
		handleSubmit,
		reset: resetForm,
		formState: { errors },
	} = useForm<MaintainFormData>({
		resolver: zodResolver(maintainFormSchema),
		defaultValues: {
			headClean: false,
			inkFlush: false,
			colorSelected: false,
			cyan: false,
			magenta: false,
			yellow: false,
			black: false,
			resetSelected: false,
			resetBox: false,
			resetProgram: false,
			status: 0,
			cleanPrinter: false,
			cleanWasteTank: false,
			replace: false,
			repair: false,
			replaceParts: [],
			repairParts: [],
			replaceUnit: false,
			replaceSerialNo: "",
			notes: "",
			signatoryId: 0,
		},
	});

	const refillInk = useWatch({ control, name: "colorSelected" }) ?? false;
	const resetGroup = useWatch({ control, name: "resetSelected" }) ?? false;
	const showReplace = useWatch({ control, name: "replace" }) ?? false;
	const showRepair = useWatch({ control, name: "repair" }) ?? false;
	const showReplaceUnit = useWatch({ control, name: "replaceUnit" }) ?? false;

	const handleSelectPrinter = (printer: PurgePrinter) => {
		setSelectedPrinter(printer);
		const client = clients.find((c) => String(c.id) === clientId);
		const location = locations.find((l) => String(l.id) === locationId);
		resetForm({
			printerId: printer.printerId,
			deploymentId: printer.deploymentId,
			client: client ? { value: client.id, label: client.name } : undefined,
			location: location ? { value: location.id, label: location.name } : undefined,
			department: { value: printer.departmentId, label: printer.department },
			model: { value: printer.modelId, label: printer.model },
			serialNo: printer.serialNo,
			userId: technicianId ? Number(technicianId) : undefined,
			headClean: false,
			inkFlush: false,
			colorSelected: false,
			cyan: false,
			magenta: false,
			yellow: false,
			black: false,
			resetSelected: false,
			resetBox: false,
			resetProgram: false,
			status: 0,
			cleanPrinter: false,
			cleanWasteTank: false,
			replace: false,
			repair: false,
			replaceParts: [],
			repairParts: [],
			replaceUnit: false,
			replaceSerialNo: "",
			notes: "",
			signatoryId: 0,
		});
		setStep(3);
	};

	const { mutateAsync: submitRecord, isPending: isSaving } = useMutation({
		mutationFn: async (payload: MaintainFormData & { maintenanceDate: string }) => {
			const res = await fetch(apiPath("/api/admin/purge-maintenance"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error || "Failed to save the historical record.");
			}
			return res.json();
		},
	});

	const onSubmit = async (data: MaintainFormData) => {
		if (!scheduledAt) return;
		try {
			await submitRecord({ ...data, maintenanceDate: scheduledAt });
			showAppToast({
				message: "Historical maintenance record saved",
				description: selectedPrinter
					? `${selectedPrinter.serialNo} — ${scheduledAt}`
					: undefined,
				position: "top-right",
				color: "success",
			});
			// Back to printer selection with the same technician/client/
			// location/date — backfilling is almost always done one site
			// visit at a time across several printers, so re-asking the
			// header fields for every single printer would be tedious.
			setSelectedPrinter(null);
			setStep(2);
			refetchPrinters();
		} catch (err) {
			showAppToast({
				message: "Save failed",
				description: err instanceof Error ? err.message : "Please try again.",
				position: "top-right",
				color: "error",
			});
		}
	};

	const stepTitle =
		step === 1
			? "Purge Maintenance — Select Details"
			: step === 2
			? "Purge Maintenance — Select Printer"
			: "Purge Maintenance — Record Details";

	return (
		<Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
			<DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<History className="h-5 w-5 text-primary" />
						{stepTitle}
					</DialogTitle>
					<p className="text-sm text-muted-foreground">
						Temporary migration tool for backfilling historical maintenance
						records. Reports created here won&apos;t show a GPS Verified
						Location, since none was captured.
					</p>
				</DialogHeader>

				{step === 1 && (
					<div className="grid gap-4 py-2">
						<div className="space-y-1">
							<Label>Technician</Label>
							<ComboBoxResponsive
								data={technicianOptions}
								placeholder="Select technician"
								selectedValue={technicianId}
								onValueChange={setTechnicianId}
								emptyMessage="No technician found."
							/>
						</div>
						<div className="space-y-1">
							<Label>Client</Label>
							<ComboBoxResponsive
								data={clientOptions}
								placeholder="Select client"
								selectedValue={clientId}
								onValueChange={setClientId}
								emptyMessage="No client found."
							/>
						</div>
						<div className="space-y-1">
							<Label>Location</Label>
							<ComboBoxResponsive
								data={locationOptions}
								placeholder="Select location"
								selectedValue={locationId}
								onValueChange={setLocationId}
								disabled={!clientId}
								emptyMessage="No location found."
							/>
						</div>
						<div className="space-y-1">
							<Label>Maintenance Date</Label>
							{/* No minDate/allowFutureDates — current and past dates are
							    both valid for a historical backfill. */}
							<DatePicker onDateSelect={setDate} selectedDate={date} />
						</div>
					</div>
				)}

				{step === 2 && (
					<div className="space-y-3 py-2">
						{isLoadingPrinters ? (
							<p className="py-6 text-center text-sm text-muted-foreground">
								Loading printers…
							</p>
						) : printers.length === 0 ? (
							<p className="py-6 text-center text-sm text-muted-foreground">
								No printers deployed at this client and location.
							</p>
						) : (
							<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
								{printers.map((p) => (
									<Card
										key={p.printerId}
										onClick={() => handleSelectPrinter(p)}
										className="cursor-pointer rounded-xl border transition-colors hover:border-primary hover:shadow-sm"
									>
										<CardContent className="flex items-start gap-3 p-4">
											<PrinterIcon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
											<div className="min-w-0 space-y-1">
												<p className="truncate font-semibold">{p.serialNo}</p>
												<p className="truncate text-sm text-muted-foreground">
													{p.model}
												</p>
												<Badge variant="outline">{p.department}</Badge>
											</div>
										</CardContent>
									</Card>
								))}
							</div>
						)}
					</div>
				)}

				{step === 3 && selectedPrinter && (
					<form onSubmit={handleSubmit(onSubmit)} className="space-y-5 py-2">
						<div className="rounded-xl border bg-muted/30 p-3 text-sm">
							<p>
								<span className="font-medium">Prepared By:</span>{" "}
								{technicianOptions.find((t) => t.value === technicianId)?.label}
							</p>
							<p>
								<span className="font-medium">Client:</span>{" "}
								{clientOptions.find((c) => c.value === clientId)?.label}{" "}
								— {locationOptions.find((l) => l.value === locationId)?.label}
							</p>
							<p>
								<span className="font-medium">Date:</span> {scheduledAt}
							</p>
							<p>
								<span className="font-medium">Printer:</span>{" "}
								{selectedPrinter.serialNo} ({selectedPrinter.model},{" "}
								{selectedPrinter.department})
							</p>
						</div>

						<div className="space-y-2">
							<Label>Work Done</Label>
							<CheckboxField name="headClean" control={control} label="Head Clean" />
							<CheckboxField name="inkFlush" control={control} label="Ink Flushing" />
							<CheckboxField
								name="colorSelected"
								control={control}
								label="Refill Ink [C] [M] [Y] [K]"
							/>
							<div className="ml-6 grid max-w-xs grid-cols-4 gap-2">
								<CheckboxField name="cyan" control={control} label="C" disabled={!refillInk} compact />
								<CheckboxField name="magenta" control={control} label="M" disabled={!refillInk} compact />
								<CheckboxField name="yellow" control={control} label="Y" disabled={!refillInk} compact />
								<CheckboxField name="black" control={control} label="K" disabled={!refillInk} compact />
							</div>
							{errors.colorGroup?.message && (
								<p className="text-sm text-red-600">{String(errors.colorGroup.message)}</p>
							)}
							<CheckboxField
								name="resetSelected"
								control={control}
								label="Reset [Box] [Program]"
							/>
							<div className="ml-6 grid max-w-xs grid-cols-2 gap-2">
								<CheckboxField name="resetBox" control={control} label="Box" disabled={!resetGroup} compact />
								<CheckboxField name="resetProgram" control={control} label="Program" disabled={!resetGroup} compact />
							</div>
							{errors.resetGroup?.message && (
								<p className="text-sm text-red-600">{String(errors.resetGroup.message)}</p>
							)}
						</div>

						<div className="space-y-1">
							<Label>Printer Status</Label>
							<Controller
								name="status"
								control={control}
								render={({ field }) => (
									<ComboBoxResponsive
										data={statusOptions}
										placeholder="Status"
										selectedValue={field.value ? String(field.value) : null}
										onValueChange={(id) => field.onChange(id ? Number(id) : 0)}
										emptyMessage="No status found."
									/>
								)}
							/>
							{errors.status && (
								<p className="text-sm text-red-500">{errors.status.message}</p>
							)}
						</div>

						<div className="space-y-2">
							<Label>Services</Label>
							<CheckboxField name="cleanPrinter" control={control} label="Cleaning of Printer" />
							<CheckboxField name="cleanWasteTank" control={control} label="Cleaning of Waste Tank" />
							<CheckboxField name="replace" control={control} label="Replacement" />
							{showReplace && (
								<Controller
									name="replaceParts"
									control={control}
									render={({ field }) => (
										<Select<Item, true>
											closeMenuOnSelect={false}
											isMulti
											value={
												field.value?.map((p) => ({
													label: p.partName ?? "",
													value: p.partId ?? "",
												})) || []
											}
											onChange={(opts) =>
												field.onChange(
													opts.map((o) => ({ partId: o.value, partName: o.label }))
												)
											}
											options={parts}
											placeholder="Replacement (please indicate the parts)"
										/>
									)}
								/>
							)}
							{errors.replaceParts?.message && (
								<p className="text-sm text-red-600">{errors.replaceParts.message}</p>
							)}
							<CheckboxField name="repair" control={control} label="Repair" />
							{showRepair && (
								<Controller
									name="repairParts"
									control={control}
									render={({ field }) => (
										<Select<Item, true>
											closeMenuOnSelect={false}
											isMulti
											value={
												field.value?.map((p) => ({
													label: p.partName ?? "",
													value: p.partId ?? "",
												})) || []
											}
											onChange={(opts) =>
												field.onChange(
													opts.map((o) => ({ partId: o.value, partName: o.label }))
												)
											}
											options={parts}
											placeholder="Repair (please indicate the parts)"
										/>
									)}
								/>
							)}
							{errors.repairParts?.message && (
								<p className="text-sm text-red-600">{errors.repairParts.message}</p>
							)}
							<CheckboxField
								name="replaceUnit"
								control={control}
								label="Replace Unit (with a different serial number)"
							/>
							{showReplaceUnit && (
								<Controller
									name="replaceSerialNo"
									control={control}
									render={({ field }) => (
										<div className="space-y-1">
											<Textarea
												{...field}
												placeholder="Replaced unit's serial number"
												rows={1}
											/>
											{errors.replaceSerialNo && (
												<p className="text-sm text-red-500">
													{errors.replaceSerialNo.message}
												</p>
											)}
										</div>
									)}
								/>
							)}
						</div>

						<div className="space-y-1">
							<Label>Notes</Label>
							<Controller
								name="notes"
								control={control}
								render={({ field }) => <Textarea {...field} rows={3} />}
							/>
						</div>

						<div className="space-y-1">
							<Label>Signatory</Label>
							<Controller
								name="signatoryId"
								control={control}
								render={({ field }) => (
									<ComboBoxResponsive
										data={signatoryOptions}
										placeholder="Signatory"
										selectedValue={field.value ? String(field.value) : null}
										onValueChange={(id) => field.onChange(id ? Number(id) : 0)}
										emptyMessage="No signatories found for this client."
									/>
								)}
							/>
							{errors.signatoryId && (
								<p className="text-sm text-red-500">{errors.signatoryId.message}</p>
							)}
						</div>

						<DialogFooter className="gap-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									setSelectedPrinter(null);
									setStep(2);
								}}
							>
								<ArrowLeft className="mr-1 h-4 w-4" /> Back to Printers
							</Button>
							<Button type="submit" disabled={isSaving}>
								{isSaving ? (
									<>
										<Loader2 className="h-4 w-4 animate-spin" /> Saving…
									</>
								) : (
									"Save Historical Record"
								)}
							</Button>
						</DialogFooter>
					</form>
				)}

				{step !== 3 && (
					<DialogFooter className="gap-2">
						{step === 2 && (
							<Button type="button" variant="outline" onClick={() => setStep(1)}>
								<ArrowLeft className="mr-1 h-4 w-4" /> Back
							</Button>
						)}
						{step === 1 && (
							<Button type="button" variant="outline" onClick={handleClose}>
								Cancel
							</Button>
						)}
						{step === 1 && (
							<Button
								type="button"
								disabled={!canFindPrinters}
								onClick={handleFindPrinters}
							>
								Find Printers
							</Button>
						)}
					</DialogFooter>
				)}
			</DialogContent>
		</Dialog>
	);
}

function CheckboxField({
	name,
	control,
	label,
	disabled,
	compact,
}: {
	name: keyof MaintainFormData;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	control: any;
	label: string;
	disabled?: boolean;
	compact?: boolean;
}) {
	return (
		<div className={compact ? "flex items-center space-x-1" : "flex items-center space-x-2"}>
			<Controller
				name={name}
				control={control}
				defaultValue={false}
				render={({ field }) => (
					<Checkbox
						id={name}
						checked={!!field.value}
						onCheckedChange={(checked) => field.onChange(checked)}
						disabled={disabled}
					/>
				)}
			/>
			<Label htmlFor={name} className="text-md font-normal">
				{label}
			</Label>
		</div>
	);
}
