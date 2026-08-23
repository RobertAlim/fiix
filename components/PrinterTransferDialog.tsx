"use client";

// components/PrinterTransferDialog.tsx
//
// Moves a printer to a new client + location. Deliberately narrower than
// the full Edit form: a transfer is a distinct business event (the unit
// physically moved), not a data correction, and it's handled by its own
// endpoint that opens a fresh deployment row instead of rewriting the
// current one. See app/api/admin/master/printers/[id]/transfer/route.ts.
//
// Model, department and serial number are intentionally NOT editable here
// — the same physical unit moved; only where it sits changed. The printer's
// original client (`deployedClient`) is never touched by this flow.
//
// Mark as Missing / Mark as Found used to live here as a second tab, but
// that's now redundant with the Status selector on the Edit Printer form
// (components/pages/Printers.tsx) — this dialog only handles Transfer.
// The markMissing/markFound actions still exist on the transfer API route
// (app/api/admin/master/printers/[id]/transfer/route.ts) for that reason
// alone; nothing in the UI calls them anymore.

import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ComboBoxResponsive, ComboboxItem } from "@/components/ui/combobox";
import { Loader2, ArrowRight, AlertTriangle } from "lucide-react";
import { fetchData } from "@/lib/fetchData";
import { apiPath } from "@/lib/base-path";
import { showAppToast } from "@/components/ui/apptoast";

interface ClientRow {
	id: number;
	name: string;
}
interface LocationRow {
	id: number;
	name: string;
	clientId: number;
	clientName: string;
}

/** The subset of a Printers grid row this dialog needs. */
export interface TransferTarget {
	id: number;
	serialNo: string;
	clientName?: string | null;
	locationName?: string | null;
	/** "Active" | "Missing" — decides which tabs this dialog opens with. */
	status?: string | null;
}

const EMPTY_CLIENTS: ClientRow[] = [];
const EMPTY_LOCATIONS: LocationRow[] = [];

export function PrinterTransferDialog({
	target,
	onOpenChange,
}: {
	/** The printer being transferred; null closes the dialog. */
	target: TransferTarget | null;
	onOpenChange: (open: boolean) => void;
}) {
	const queryClient = useQueryClient();
	const [clientId, setClientId] = useState<string | null>(null);
	const [locationId, setLocationId] = useState<string | null>(null);
	const isCurrentlyMissing = target?.status === "Missing";

	// Reset on every new target, otherwise the previous printer's selection
	// carries over into the next dialog.
	useEffect(() => {
		setClientId(null);
		setLocationId(null);
	}, [target?.id]);

	const { data: clients = EMPTY_CLIENTS } = useQuery<ClientRow[]>({
		queryKey: ["/api/admin/master/clients"],
		queryFn: () => fetchData<ClientRow[]>("/api/admin/master/clients"),
		staleTime: 1000 * 60 * 5,
		enabled: !!target,
	});

	const { data: locations = EMPTY_LOCATIONS } = useQuery<LocationRow[]>({
		queryKey: ["/api/admin/master/locations"],
		queryFn: () => fetchData<LocationRow[]>("/api/admin/master/locations"),
		staleTime: 1000 * 60 * 5,
		enabled: !!target,
	});

	const clientOptions: ComboboxItem[] = useMemo(
		() => clients.map((c) => ({ value: String(c.id), label: c.name })),
		[clients]
	);

	// Locations are scoped to the chosen client. The server re-checks this
	// pairing — this filter is convenience, not the guard.
	const locationOptions: ComboboxItem[] = useMemo(() => {
		if (!clientId) return [];
		return locations
			.filter((l) => l.clientId === Number(clientId))
			.map((l) => ({ value: String(l.id), label: l.name }));
	}, [locations, clientId]);

	const transfer = useMutation({
		mutationFn: async () => {
			if (!target) return;
			if (!clientId || !locationId) return;
			const body = {
				action: "transfer" as const,
				clientId: Number(clientId),
				locationId: Number(locationId),
			};

			const res = await fetch(
				apiPath(`/api/admin/master/printers/${target.id}/transfer`),
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				}
			);
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				throw new Error(data.error || "Could not transfer the printer.");
			}
			return data as { clientName?: string; locationName?: string; status?: string };
		},
		onSuccess: (data) => {
			showAppToast({
				message: "Printer transferred",
				description: data
					? `${target?.serialNo} is now at ${data.locationName} (${data.clientName}).`
					: undefined,
				position: "top-right",
				color: "success",
			});
			// The Printers grid is server-paged and keyed by its query string,
			// so invalidate the endpoint prefix rather than one exact page.
			queryClient.invalidateQueries({
				queryKey: ["/api/admin/master/printers"],
			});
			onOpenChange(false);
		},
		onError: (err) => {
			showAppToast({
				message: "Transfer failed",
				description: err instanceof Error ? err.message : "Please try again.",
				position: "top-right",
				color: "error",
			});
		},
	});

	const canSubmit = !transfer.isPending && !!clientId && !!locationId;

	return (
		<Dialog open={!!target} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Transfer printer</DialogTitle>
					<DialogDescription>
						Move {target?.serialNo} to a new client and location. Its
						original client stays on record, and past maintenance reports
						keep showing where the work was actually done.
					</DialogDescription>
				</DialogHeader>

				{/* Marking a unit Missing/Found now lives on the Edit Printer
				    form's Status selector, not here — this is just a heads-up
				    for anyone transferring a unit that's currently flagged. */}
				{isCurrentlyMissing && (
					<div className="flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
						<AlertTriangle className="h-4 w-4 shrink-0" />
						Currently marked Missing. Transferring it here does not clear
						that flag — update Status on the Edit Printer form for that.
					</div>
				)}

				<div className="space-y-4">
					<div className="rounded-lg border bg-muted/40 p-3 text-sm">
						<p className="text-xs font-medium text-muted-foreground">
							Currently at
						</p>
						<p className="flex items-center gap-2">
							<span>{target?.clientName ?? "—"}</span>
							<ArrowRight className="h-3 w-3 text-muted-foreground" />
							<span>{target?.locationName ?? "—"}</span>
						</p>
					</div>

					<div className="space-y-1">
						<label className="text-sm font-medium">New client</label>
						<ComboBoxResponsive
							data={clientOptions}
							placeholder="Select client"
							selectedValue={clientId}
							onValueChange={(v) => {
								setClientId(v);
								// A location from the previous client would no longer
								// be valid, so it's cleared rather than left stale.
								setLocationId(null);
							}}
							emptyMessage="No client found."
						/>
					</div>

					<div className="space-y-1">
						<label className="text-sm font-medium">New location</label>
						<ComboBoxResponsive
							data={locationOptions}
							placeholder={
								clientId ? "Select location" : "Select a client first"
							}
							selectedValue={locationId}
							onValueChange={setLocationId}
							emptyMessage="This client has no locations yet."
							disabled={!clientId}
						/>
					</div>
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={transfer.isPending}
					>
						Cancel
					</Button>
					<Button onClick={() => transfer.mutate()} disabled={!canSubmit}>
						{transfer.isPending ? (
							<>
								<Loader2 className="h-4 w-4 animate-spin" /> Transferring…
							</>
						) : (
							"Transfer"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
