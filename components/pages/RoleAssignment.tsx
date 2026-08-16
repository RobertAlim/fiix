"use client";

import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ComboBoxResponsive, ComboboxItem } from "@/components/ui/combobox";
import { ShieldCheck, Crown, UserCog, Wrench, CalendarClock, HelpCircle } from "lucide-react";
import { fetchData } from "@/lib/fetchData";
import { showAppToast } from "@/components/ui/apptoast";
import { ROLES, Role } from "@/lib/permissions";
import { apiPath } from "@/lib/base-path";
import { useUserStore } from "@/state/userStore";

interface AdminUserRow {
	id: number;
	firstName: string;
	lastName: string;
	email: string;
	role: string | null;
	isActive: boolean;
	createdAt: string;
}

const ROLE_OPTIONS: ComboboxItem[] = ROLES.map((r) => ({ value: r, label: r }));

// Display order for the grouped sections — deliberately most-privileged
// first (Super Admin, then Admin) down to least, with an "Unassigned"
// bucket last for accounts that signed up but haven't been given a role
// yet. Kept separate from `ROLES` (used for the per-card dropdown, where
// alphabetical-ish declaration order is fine) since this order is purely
// about what reads best as a page layout.
const GROUP_ORDER: (Role | "Unassigned")[] = [
	"Super Admin",
	"Admin",
	"Scheduler",
	"Technician",
	"Unassigned",
];

const GROUP_ICON: Record<Role | "Unassigned", React.ElementType> = {
	"Super Admin": Crown,
	Admin: UserCog,
	Scheduler: CalendarClock,
	Technician: Wrench,
	Unassigned: HelpCircle,
};

export default function RoleAssignmentPage() {
	const queryClient = useQueryClient();
	const { users: viewer } = useUserStore();

	const { data: userRows = [], isLoading } = useQuery<AdminUserRow[]>({
		queryKey: ["admin-users"],
		queryFn: () => fetchData<AdminUserRow[]>("/api/admin/users"),
	});

	const { mutate: updateUser } = useMutation({
		mutationFn: async (payload: {
			id: number;
			role?: Role;
			isActive?: boolean;
		}) => {
			const { id, ...body } = payload;
			const res = await fetch(apiPath(`/api/admin/users/${id}`), {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error || "Failed to update user.");
			}
			return res.json();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin-users"] });
		},
		onError: (error: Error) => {
			showAppToast({
				message: "Failed to update user",
				description: error.message,
				position: "top-right",
				color: "error",
			});
			queryClient.invalidateQueries({ queryKey: ["admin-users"] });
		},
	});

	return (
		<Card className="rounded-2xl border shadow-sm">
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base font-semibold">
					<ShieldCheck className="h-5 w-5 text-primary" />
					Role Assignment
				</CardTitle>
				<p className="text-sm text-muted-foreground">
					Assign roles and activate accounts. New sign-ups stay inactive
					until you enable them here.
				</p>
			</CardHeader>
			<CardContent>
				{/* Only shows for an Admin during the bootstrap window (see
				    requireSuperAdmin() in lib/require-role.ts) — explains why
				    this screen is reachable at all, since it's normally
				    Super-Admin-only. Disappears the moment any account holds
				    Super Admin, including right after this Admin assigns it
				    to themselves below. */}
				{viewer?.role === "Admin" &&
					!isLoading &&
					!userRows.some((r) => r.role === "Super Admin") && (
						<div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
							<Crown className="mt-0.5 h-4 w-4 shrink-0" />
							No Super Admin exists yet, so this screen is temporarily open
							to you as an Admin. Assign the Super Admin role to an account
							below to finish setup — this notice and your access to the
							other reserved sections will then follow the normal rule.
						</div>
					)}

				{isLoading ? (
					<p className="py-6 text-center text-sm text-muted-foreground">
						Loading users…
					</p>
				) : userRows.length === 0 ? (
					<p className="py-6 text-center text-sm text-muted-foreground">
						No users found.
					</p>
				) : (
					<div className="space-y-6">
						{GROUP_ORDER.map((groupKey) => {
							const rows = userRows.filter((row) =>
								groupKey === "Unassigned" ? !row.role : row.role === groupKey
							);
							if (rows.length === 0) return null;
							const Icon = GROUP_ICON[groupKey];
							return (
								<div key={groupKey} className="space-y-3">
									<div className="flex items-center gap-2">
										<Icon className="h-4 w-4 text-muted-foreground" />
										<h3 className="text-sm font-semibold">{groupKey}</h3>
										<Badge variant="outline" className="ml-1">
											{rows.length}
										</Badge>
									</div>
									<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
										{rows.map((row) => (
											<UserRoleCard
												key={row.id}
												row={row}
												onUpdate={updateUser}
											/>
										))}
									</div>
								</div>
							);
						})}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function UserRoleCard({
	row,
	onUpdate,
}: {
	row: AdminUserRow;
	onUpdate: (payload: { id: number; role?: Role; isActive?: boolean }) => void;
}) {
	return (
		<Card className="rounded-xl border shadow-none">
			<CardContent className="space-y-3 p-4">
				<div className="flex items-start justify-between gap-2">
					<div>
						<p className="font-semibold leading-tight">
							{row.firstName} {row.lastName}
						</p>
						<p className="text-xs text-muted-foreground">{row.email}</p>
					</div>
					<Badge
						className={
							row.isActive
								? "bg-success text-success-foreground"
								: "bg-warning text-warning-foreground"
						}
					>
						{row.isActive ? "Active" : "Inactive"}
					</Badge>
				</div>

				<div className="space-y-1">
					<label className="text-xs font-medium text-muted-foreground">
						Role
					</label>
					<ComboBoxResponsive
						data={ROLE_OPTIONS}
						placeholder="Assign role"
						selectedValue={row.role}
						onValueChange={(value) => {
							if (!value) return;
							onUpdate({ id: row.id, role: value as Role });
						}}
						emptyMessage="No roles found."
					/>
				</div>

				<div className="flex items-center justify-between pt-1">
					<span className="text-sm font-medium">Account Active</span>
					<Switch
						checked={row.isActive}
						onCheckedChange={(checked) => {
							if (checked && !row.role) {
								showAppToast({
									message: "Assign a role first",
									description: "Choose a role before activating this user.",
									position: "top-right",
									color: "warning",
								});
								return;
							}
							onUpdate({ id: row.id, isActive: checked });
						}}
					/>
				</div>
			</CardContent>
		</Card>
	);
}
