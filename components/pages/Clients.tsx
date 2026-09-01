// components/pages/Clients.tsx
//
// New page: manages the two pieces of data the Monitoring report
// (components/pages/Monitoring.tsx) needs but nothing else in this app
// previously had anywhere to set —
//   1. Which Area (South/North) each client belongs to.
//   2. Which Client Group (a proximity cluster of nearby clients) each
//      client belongs to, if any.
//
// Client name creation/rename still goes through the same
// /api/admin/master/clients endpoint the Printers/Locations forms already
// use to add a client on the fly — this page is additive, not a
// replacement for that.
"use client";

import React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MasterDataManager, type DataRow } from "@/components/MasterDataManager";
import { Badge } from "@/components/ui/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Building2, Users } from "lucide-react";
import { fetchData } from "@/lib/fetchData";
import { apiPath } from "@/lib/base-path";
import { showAppToast } from "@/components/ui/apptoast";

interface ClientGroupRow {
	id: number;
	name: string;
	area: "South" | "North";
}

const AREA_BADGE_CLASS: Record<string, string> = {
	South: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
	North: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
};

function AreaBadge({ area }: { area: string | null }) {
	if (!area) {
		return <span className="text-sm text-muted-foreground">Unassigned</span>;
	}
	return (
		<Badge variant="outline" className={AREA_BADGE_CLASS[area] ?? ""}>
			{area} Area
		</Badge>
	);
}

const UNASSIGNED = "__unassigned__";

/**
 * The "Client Group" cell in the Clients grid — a live dropdown rather
 * than something you open the edit dialog for, since reassigning a client
 * between nearby groups as locations change (the whole point of this
 * feature per the original request) is meant to be a quick, frequent
 * action. Only offers groups in the client's OWN Area — the API rejects a
 * cross-Area assignment anyway (a group's Area is what places its
 * separator row in the Monitoring report), so a client with no Area set
 * yet can't be grouped until one is chosen first.
 */
function ClientGroupCell({ row, groups }: { row: DataRow; groups: ClientGroupRow[] }) {
	const queryClient = useQueryClient();
	const area = row.area as string | null;
	const currentGroupId = row.clientGroupId != null ? String(row.clientGroupId) : UNASSIGNED;
	const optionsForArea = groups.filter((g) => g.area === area);

	const { mutate, isPending } = useMutation({
		mutationFn: async (nextGroupId: number | null) => {
			const res = await fetch(apiPath(`/api/admin/master/clients/${row.id}`), {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ clientGroupId: nextGroupId }),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data.error || "Could not update Client Group.");
			return data;
		},
		onSuccess: () => {
			showAppToast({ message: "Client Group updated", position: "top-right", color: "success" });
			// Partial key match (no `exact`) — MasterDataManager's own query
			// key for this grid is [listEndpoint, queryString]; invalidating
			// by the endpoint alone catches it regardless of the current
			// search/filter/page state.
			queryClient.invalidateQueries({ queryKey: ["/api/admin/master/clients"] });
		},
		onError: (err) => {
			showAppToast({
				message: "Couldn't update Client Group",
				description: err instanceof Error ? err.message : "Please try again.",
				position: "top-right",
				color: "error",
			});
		},
	});

	if (!area) {
		return (
			<span className="text-sm text-muted-foreground" title="Set this client's Area first">
				Set Area first
			</span>
		);
	}

	return (
		<Select
			value={currentGroupId}
			disabled={isPending}
			onValueChange={(v) => mutate(v === UNASSIGNED ? null : Number(v))}
		>
			<SelectTrigger size="sm" className="w-[200px]" onClick={(e) => e.stopPropagation()}>
				<SelectValue placeholder="Ungrouped" />
			</SelectTrigger>
			<SelectContent onClick={(e) => e.stopPropagation()}>
				<SelectItem value={UNASSIGNED}>Ungrouped</SelectItem>
				{optionsForArea.map((g) => (
					<SelectItem key={g.id} value={String(g.id)}>
						{g.name}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

export default function ClientsPage() {
	// Loaded once here (not per-row) and handed down to every ClientGroupCell
	// — one request backs the whole grid's dropdowns instead of one per row.
	const { data: groups = [] } = useQuery<ClientGroupRow[]>({
		queryKey: ["/api/admin/master/client-groups"],
		queryFn: () => fetchData<ClientGroupRow[]>("/api/admin/master/client-groups"),
		staleTime: 1000 * 30,
	});

	return (
		<div className="space-y-6">
			<Card className="rounded-2xl border shadow-sm">
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base font-semibold">
						<Users className="h-5 w-5 text-primary" />
						Client Groups
					</CardTitle>
					<p className="text-sm text-muted-foreground">
						Proximity clusters of nearby clients — shown as the gray
						separator rows in the Monitoring report, so a Scheduler can
						spot which clients are close together when building an
						itinerary. Each group belongs to one Area; only clients in
						that same Area can be assigned to it.
					</p>
				</CardHeader>
				<CardContent>
					<MasterDataManager
						title="Client Group"
						listEndpoint="/api/admin/master/client-groups"
						itemEndpoint={(id) => `/api/admin/master/client-groups/${id}`}
						filters={[
							{ param: "search", label: "Name" },
							{
								param: "area",
								label: "Area",
								type: "select",
								options: [
									{ value: "South", label: "South Area" },
									{ value: "North", label: "North Area" },
								],
							},
						]}
						columns={[
							{ key: "name", label: "Name", minWidth: "min-w-[200px]" },
							{
								key: "area",
								label: "Area",
								minWidth: "min-w-[140px]",
								render: (r) => <AreaBadge area={r.area as string} />,
							},
						]}
						fields={[
							{ name: "name", label: "Name", type: "text", required: true },
							{
								name: "area",
								label: "Area",
								type: "radio-card",
								required: true,
								radioOptions: [
									{ value: "South", label: "South Area", color: "blue" },
									{ value: "North", label: "North Area", color: "green" },
								],
							},
						]}
						displayName={(row) => String(row.name)}
					/>
				</CardContent>
			</Card>

			<Card className="rounded-2xl border shadow-sm">
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base font-semibold">
						<Building2 className="h-5 w-5 text-primary" />
						Clients
					</CardTitle>
					<p className="text-sm text-muted-foreground">
						Every client&apos;s Area and Client Group, both of which feed the
						Monitoring report. Client Group can be changed any time — right
						from this grid — as locations change and clients get
						re-clustered.
					</p>
				</CardHeader>
				<CardContent>
					<MasterDataManager
						title="Client"
						listEndpoint="/api/admin/master/clients"
						itemEndpoint={(id) => `/api/admin/master/clients/${id}`}
						filters={[{ param: "search", label: "Name" }]}
						columns={[
							{ key: "name", label: "Name", minWidth: "min-w-[220px]" },
							{
								key: "area",
								label: "Area",
								minWidth: "min-w-[130px]",
								render: (r) => <AreaBadge area={r.area as string | null} />,
							},
							{
								key: "clientGroupName",
								label: "Client Group",
								minWidth: "min-w-[220px]",
								render: (r) => <ClientGroupCell row={r} groups={groups} />,
							},
						]}
						fields={[
							{ name: "name", label: "Name", type: "text", required: true },
							{
								name: "area",
								label: "Area",
								type: "radio-card",
								radioOptions: [
									{ value: "South", label: "South Area", color: "blue" },
									{ value: "North", label: "North Area", color: "green" },
								],
							},
						]}
						displayName={(row) => String(row.name)}
					/>
				</CardContent>
			</Card>
		</div>
	);
}
