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
					Everyone on this list with &quot;Active&quot; checked gets a text
					whenever any Technician times in.
				</p>
			</CardHeader>
			<CardContent>
				<MasterDataManager
					title="Recipient"
					listEndpoint="/api/admin/master/sms-recipients"
					itemEndpoint={(id) => `/api/admin/master/sms-recipients/${id}`}
					filters={[{ param: "search", label: "Label" }]}
					columns={[
						{ key: "label", label: "Label", minWidth: "min-w-[160px]" },
						{ key: "mobileNumber", label: "Mobile Number", minWidth: "min-w-[150px]" },
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
						{ name: "label", label: "Label", type: "text", required: true, placeholder: "e.g. Ops Manager" },
						{
							name: "mobileNumber",
							label: "Mobile Number",
							type: "text",
							required: true,
							placeholder: "09XXXXXXXXX",
						},
						{
							name: "isActive",
							label: "Active",
							type: "boolean",
							defaultValue: "true",
						},
					]}
					displayName={(row) => String(row.label)}
				/>
			</CardContent>
		</Card>
	);
}
