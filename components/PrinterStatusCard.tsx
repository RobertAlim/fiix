// components/printer-status-card.tsx
"use client";

import React, { useEffect, useState } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Printer } from "@/components/columns/printers/columns";
import { showAppToast } from "./ui/apptoast";

export function PrinterStatusCard({
	id,
	department,
	model,
	serialNo,
	status,
	notes,
	lastMt,
	mtId,
	schedDetailsId,
	isMaintained,
	maintainedDate,
	isToggled: initialToggle,
	onToggleChange,
}: Printer) {
	const [localToggle, setLocalToggle] = useState<boolean>(initialToggle);

	// Sync with prop changes
	useEffect(() => {
		setLocalToggle(initialToggle);
	}, [initialToggle]);

	const handleToggle = () => {
		if (isMaintained) {
			showAppToast({
				message: "Maintenance Done",
				description: "This printer is already maintained.",
				color: "warning",
				position: "top-right",
			});
			return;
		}

		setLocalToggle((prev) => {
			const next = !prev;
			// Defer parent update until after this component's render is done
			queueMicrotask(() => onToggleChange(next));
			return next;
		});
	};
	return (
		<Card
			className={`w-full shadow-lg hover:shadow-xl ease-in-out transition-colors duration-200 cursor-pointer ${
				localToggle ? "bg-green-100" : "bg-white"
			} border ${localToggle ? "border-green-300" : "border-gray-200"}`}
			onClick={() => handleToggle()}
		>
			<CardHeader>
				<div className="flex justify-between items-center">
					<CardTitle className="text-lg font-bold text-gray-800">
						<span className="inline sm:hidden md:inline lg:hidden">#: </span>
						<span className="hidden sm:inline md:hidden lg:inline">
							Printer:{" "}
						</span>
						{id}
					</CardTitle>

					<Badge
						variant={
							status === "Good Condition"
								? "secondary"
								: status === "Pulled Out"
								? "default"
								: status === null
								? "outline"
								: "destructive"
						}
						className="px-3 py-1 text-sm font-semibold rounded-full"
					>
						<span className="hidden sm:inline lg:inline">
							{status === null ? "New Unit" : status}
						</span>
						<span className="sm:hidden lg:hidden">
							{status === null
								? "NEW"
								: status === "Good Condition"
								? "RM"
								: status === "Pulled Out"
								? "PO"
								: status === "Replacement (Unit)"
								? "RU"
								: "RP"}
						</span>
					</Badge>
				</div>
				<CardDescription className="text-sm text-gray-500">
					Serial No: {serialNo}
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-4">
				<div className="flex items-center space-x-4 p-2 rounded-md">
					<div className="flex-1 space-y-1">
						<p className="text-sm font-medium leading-none text-gray-700">
							Model
						</p>
						<p className="text-md font-semibold text-gray-900">{model}</p>
					</div>
					<Separator orientation="vertical" className="h-10" />
					<div className="flex-1 space-y-1 text-right">
						<p className="text-sm font-medium leading-none text-gray-700">
							Department
						</p>
						<p className="text-md font-semibold text-gray-900">{department}</p>
					</div>
				</div>

				<Separator />

				<div className="grid grid-cols-2 gap-4">
					<div>
						<p className="text-sm font-medium text-gray-700">
							Last Maintenance
						</p>
						<p className="text-md font-semibold text-gray-900">
							{lastMt !== null ? format(lastMt, "MM/dd h:mm aa") : ""}
						</p>
					</div>
					<div>
						<p className="text-sm font-medium text-gray-700">Maintenance ID</p>
						<p className="text-md font-semibold text-gray-900">{mtId}</p>
					</div>
				</div>

				<div className="grid grid-cols-2 gap-4">
					<div>
						<p className="text-sm font-medium text-gray-700">Maintained Date</p>
						<p className="text-md font-semibold text-gray-900">
							{maintainedDate !== null
								? format(maintainedDate, "MM/dd h:mm aa")
								: ""}
						</p>
					</div>
					<div>
						<p className="text-sm font-medium text-gray-700">
							Sched Details ID
						</p>
						<p className="text-md font-semibold text-gray-900">
							{schedDetailsId || "Not Scheduled"}
						</p>
					</div>
				</div>

				<div
					className={`mt-2 p-3 border ${
						status === "Good Condition"
							? "bg-green-50 border-green-200"
							: status === "Pulled Out"
							? "bg-blue-50 border-blue-200"
							: "bg-red-50 border-red-200"
					}  rounded-md`}
				>
					<p
						className={`text-sm font-medium ${
							status === "Good Condition"
								? "text-green-700"
								: status === "Pulled Out"
								? "text-blue-700"
								: "text-red-700"
						}`}
					>
						Current Issue:
					</p>
					<p
						className={`text-md font-semibold ${
							status === "Good Condition"
								? "text-green-800"
								: status === "Pulled Out"
								? "text-blue-800"
								: "text-red-800"
						}`}
					>
						{notes}
					</p>
				</div>
			</CardContent>
		</Card>
	);
}
