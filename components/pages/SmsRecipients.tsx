"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MasterDataManager } from "@/components/MasterDataManager";
import { Badge } from "@/components/ui/badge";
import { MessageSquare } from "lucide-react";

export default function SmsRecipientsPage() {
	return (
		<Card className="rounded-2xl border shadow-sm">
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base font-semibold">
					<MessageSquare className="h-5 w-5 text-primary" />
					SMS Recipients
				</CardTitle>
				<p className="text-sm text-muted-foreground">
					Anyone on this list with &quot;Active&quot; checked gets a text
					whenever any Technician times in — eligibility is based solely
					on Active status here, regardless of their system role. The
					number sent to is whatever&apos;s on that person&apos;s account;
					update it from their profile and the next message uses the new
					number automatically.
				</p>
			</CardHeader>
			<CardContent>
				<MasterDataManager
					title="Recipient"
					listEndpoint="/api/admin/master/sms-recipients"
					itemEndpoint={(id) => `/api/admin/master/sms-recipients/${id}`}
					filters={[{ param: "search", label: "Name" }]}
					columns={[
						{
							key: "firstName",
							label: "Name",
							minWidth: "min-w-[160px]",
							render: (r) => `${r.firstName} ${r.lastName}`,
						},
						{ key: "role", label: "Role", minWidth: "min-w-[100px]" },
						{
							key: "contactNo",
							label: "Mobile Number",
							minWidth: "min-w-[140px]",
							render: (r) =>
								r.contactNo ? (
									String(r.contactNo)
								) : (
									<span className="text-muted-foreground">
										Not set on profile
									</span>
								),
						},
						{
							key: "isActive",
							label: "Status",
							minWidth: "min-w-[100px]",
							render: (r) => (
								<Badge variant={r.isActive ? "default" : "outline"}>
									{r.isActive ? "Active" : "Inactive"}
								</Badge>
							),
						},
					]}
					fields={[
						{
							name: "userId",
							label: "User",
							type: "select",
							required: true,
							immutable: true,
							// No role filter — any user can be a recipient now (see
							// lib/sms.ts's getActiveSmsRecipientNumbers). Was previously
							// scoped to ?role=Admin,Scheduler.
							optionsEndpoint: "/api/admin/users",
							optionsQueryKey: ["/api/admin/users"],
							optionsMap: (r) => ({
								value: String(r.id),
								label: `${r.firstName} ${r.lastName}${r.role ? ` (${r.role})` : ""}${
									r.contactNo ? "" : " — no number on file"
								}`,
							}),
						},
						{
							name: "isActive",
							label: "Active",
							type: "boolean",
							defaultValue: "true",
						},
					]}
					displayName={(row) => `${row.firstName} ${row.lastName}`}
				/>
			</CardContent>
		</Card>
	);
}
