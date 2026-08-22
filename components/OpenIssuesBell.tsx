"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { OpenIssueComponent } from "@/components/OpenIssueComponents";
import { fetchData } from "@/lib/fetchData";
import { MaintenanceOpenIssues } from "@/types/index";

/**
 * Topbar bell showing the number of unresolved open issues, opening the full
 * list on click.
 *
 * The count comes straight from /api/open-issues, which now filters to
 * unresolved statuses server-side — so a printer that gets maintained drops
 * out of both the badge and the list on the next refetch with no extra
 * bookkeeping here.
 *
 * Rendered only for roles the endpoint actually authorizes (Admin,
 * Scheduler); a Technician would just get a 403 and a permanently empty bell.
 */
export function OpenIssuesBell({ enabled = true }: { enabled?: boolean }) {
	const [open, setOpen] = useState(false);

	const { data: issues = [] } = useQuery<MaintenanceOpenIssues[]>({
		queryKey: ["openIssues"],
		queryFn: () => fetchData<MaintenanceOpenIssues[]>("/api/open-issues"),
		enabled,
		staleTime: 1000 * 60,
		// Keeps the badge honest while the scheduler leaves the tab open.
		refetchInterval: 1000 * 60 * 5,
		refetchOnWindowFocus: true,
	});

	if (!enabled) return null;

	const count = issues.length;

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger asChild>
				<button
					className="relative rounded-full p-2 hover:bg-accent"
					aria-label={
						count > 0 ? `${count} open issues` : "Open issues (none)"
					}
				>
					<Bell className="h-5 w-5" />
					{count > 0 && (
						<span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white">
							{count > 99 ? "99+" : count}
						</span>
					)}
				</button>
			</SheetTrigger>
			<SheetContent className="flex w-full flex-col sm:w-[440px]">
				<SheetHeader>
					<SheetTitle>Open Issues</SheetTitle>
					<SheetDescription>
						{count === 0
							? "No unresolved issues right now."
							: `${count} printer${count === 1 ? "" : "s"} still awaiting resolution.`}
					</SheetDescription>
				</SheetHeader>
				<div className="flex-1 overflow-y-auto px-4 pb-4">
					<div className="grid gap-4">
						{[...issues]
							.sort(
								(a, b) =>
									new Date(a.createdAt).getTime() -
									new Date(b.createdAt).getTime()
							)
							.map((issue) => (
								<OpenIssueComponent key={issue.id} {...issue} />
							))}
					</div>
				</div>
			</SheetContent>
		</Sheet>
	);
}
