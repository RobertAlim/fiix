"use client";

import React from "react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
	CloudOff,
	CloudUpload,
	CheckCircle2,
	AlertCircle,
	RefreshCw,
	Clock3,
} from "lucide-react";
import {
	useOfflineSync,
	useConnectivity,
	kickForegroundSync,
} from "@/features/offline-sync";
import type { SyncStatus } from "@/features/offline-sync";
import { formatDistanceToNow } from "date-fns";

const STATUS_LABEL: Record<SyncStatus, string> = {
	pending: "Pending",
	"waiting-for-connection": "Waiting for Connection",
	"uploading-images": "Uploading Images",
	"uploading-signature": "Uploading Signature",
	"uploading-report": "Uploading Report",
	completed: "Synced",
	failed: "Failed",
	retrying: "Retrying",
};

function statusDot(status: SyncStatus): string {
	if (status === "completed") return "bg-green-500";
	if (status === "failed") return "bg-red-500";
	if (status.startsWith("uploading")) return "bg-blue-500";
	return "bg-yellow-500"; // pending / waiting / retrying
}

/**
 * Global sync health chip: 🟢 synced · 🟡 pending · 🔵 uploading · 🔴 failed,
 * with a popover listing every queued report, its state, and retry info.
 * Lives in the dashboard header so the technician always knows whether their
 * work has reached the server.
 */
export function SyncStatusIndicator({ className }: { className?: string }) {
	const sync = useOfflineSync();
	const { online, isSlow } = useConnectivity();

	if (!sync.loaded) return null;

	const overall = !online
		? { color: "bg-yellow-500", label: "Offline", Icon: CloudOff }
		: sync.failedCount > 0
		? { color: "bg-red-500", label: "Sync Failed", Icon: AlertCircle }
		: sync.uploading
		? { color: "bg-blue-500", label: "Uploading", Icon: CloudUpload }
		: sync.pendingCount > 0
		? { color: "bg-yellow-500", label: "Pending Upload", Icon: Clock3 }
		: { color: "bg-green-500", label: "Synced", Icon: CheckCircle2 };

	const active = sync.reports.filter((r) => r.status !== "completed");

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className={cn("gap-2 px-2", className)}
					aria-label={`Sync status: ${overall.label}`}
				>
					<span
						className={cn(
							"h-2.5 w-2.5 rounded-full",
							overall.color,
							(sync.uploading || !online) && "animate-pulse"
						)}
					/>
					<overall.Icon className="h-4 w-4" />
					<span className="hidden sm:inline text-xs font-medium">
						{overall.label}
					</span>
					{sync.pendingCount > 0 && (
						<Badge variant="secondary" className="px-1.5 text-[10px]">
							{sync.pendingCount}
						</Badge>
					)}
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-80">
				<div className="flex items-center justify-between">
					<p className="text-sm font-semibold">Synchronization</p>
					<Button
						variant="outline"
						size="sm"
						className="h-7 gap-1 text-xs"
						onClick={() => kickForegroundSync()}
						disabled={!online}
					>
						<RefreshCw className="h-3 w-3" />
						Sync now
					</Button>
				</div>

				<div className="mt-2 space-y-1 text-xs text-muted-foreground">
					<p>
						Connection:{" "}
						<span className="font-medium text-foreground">
							{online ? (isSlow ? "Online (slow)" : "Online") : "Offline"}
						</span>
					</p>
					<p>
						Pending reports:{" "}
						<span className="font-medium text-foreground">
							{sync.pendingCount}
						</span>
						{" · "}Queued uploads:{" "}
						<span className="font-medium text-foreground">
							{sync.queuedUploads}
						</span>
					</p>
					<p>
						Last successful sync:{" "}
						<span className="font-medium text-foreground">
							{sync.lastSyncAt
								? formatDistanceToNow(sync.lastSyncAt, { addSuffix: true })
								: "—"}
						</span>
					</p>
				</div>

				{active.length > 0 && (
					<ScrollArea className="mt-3 max-h-56 border-t pt-2">
					<div className="space-y-2">
						{active.map((r) => (
							<div key={r.uuid} className="text-xs">
								<div className="flex items-center gap-2">
									<span
										className={cn(
											"h-2 w-2 shrink-0 rounded-full",
											statusDot(r.status)
										)}
									/>
									<span className="font-medium">
										{STATUS_LABEL[r.status]}
									</span>
									{r.retryCount > 0 && (
										<span className="text-muted-foreground">
											· attempt {r.retryCount}
										</span>
									)}
								</div>
								<p className="ml-4 text-muted-foreground">
									Saved{" "}
									{formatDistanceToNow(r.createdAt, { addSuffix: true })}
									{r.gps &&
										` · GPS ±${Math.round(r.gps.accuracy)}m`}
								</p>
								{r.lastError && (
									<p className="ml-4 truncate text-red-500">
										{r.lastError}
									</p>
								)}
							</div>
						))}
					</div>
					</ScrollArea>
				)}

				{active.length === 0 && (
					<p className="mt-3 border-t pt-2 text-xs text-muted-foreground">
						All maintenance reports are synced to the server.
					</p>
				)}
			</PopoverContent>
		</Popover>
	);
}
