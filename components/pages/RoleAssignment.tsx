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
import { ShieldCheck } from "lucide-react";
import { fetchData } from "@/lib/fetchData";
import { showAppToast } from "@/components/ui/apptoast";
import { ROLES, Role } from "@/lib/permissions";
import { apiPath } from "@/lib/base-path";

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

export default function RoleAssignmentPage() {
	const queryClient = useQueryClient();

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
				{isLoading ? (
					<p className="py-6 text-center text-sm text-muted-foreground">
						Loading users…
					</p>
				) : userRows.length === 0 ? (
					<p className="py-6 text-center text-sm text-muted-foreground">
						No users found.
					</p>
				) : (
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
						{userRows.map((row) => (
							<Card
								key={row.id}
								className="rounded-xl border shadow-none"
							>
								<CardContent className="space-y-3 p-4">
									<div className="flex items-start justify-between gap-2">
										<div>
											<p className="font-semibold leading-tight">
												{row.firstName} {row.lastName}
											</p>
											<p className="text-xs text-muted-foreground">
												{row.email}
											</p>
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
												updateUser({ id: row.id, role: value as Role });
											}}
											emptyMessage="No roles found."
										/>
									</div>

									<div className="flex items-center justify-between pt-1">
										<span className="text-sm font-medium">
											Account Active
										</span>
										<Switch
											checked={row.isActive}
											onCheckedChange={(checked) => {
												if (checked && !row.role) {
													showAppToast({
														message: "Assign a role first",
														description:
															"Choose a role before activating this user.",
														position: "top-right",
														color: "warning",
													});
													return;
												}
												updateUser({ id: row.id, isActive: checked });
											}}
										/>
									</div>
								</CardContent>
							</Card>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
