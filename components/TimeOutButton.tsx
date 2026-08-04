"use client";

// components/TimeOutButton.tsx
import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
	DialogTrigger,
} from "@/components/ui/dialog";
import { LogOut, Loader2 } from "lucide-react";
import { apiPath } from "@/lib/base-path";
import { showAppToast } from "@/components/ui/apptoast";

/** Kept intentionally impossible to miss — a large, high-contrast button
 * rather than something tucked into a menu, per the spec's "highly visible"
 * requirement. A confirm step guards against an accidental tap ending the
 * whole session (there's no undo: Time In requires a fresh geofence check). */
export function TimeOutButton() {
	const queryClient = useQueryClient();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [open, setOpen] = useState(false);

	const handleTimeOut = async () => {
		setIsSubmitting(true);
		try {
			const res = await fetch(apiPath("/api/attendance/time-out"), {
				method: "POST",
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error || "Failed to time out.");
			}
			showAppToast({
				message: "Timed out",
				description: "Your shift has ended.",
				position: "top-right",
				color: "success",
			});
			setOpen(false);
			// Sends the technician back to the Time In gate — AttendanceGate
			// re-renders as soon as this query refetches.
			queryClient.invalidateQueries({ queryKey: ["attendance-status"] });
		} catch (err) {
			showAppToast({
				message: "Time Out failed",
				description: err instanceof Error ? err.message : "Please try again.",
				position: "top-right",
				color: "error",
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					size="sm"
					className="gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90"
				>
					<LogOut className="h-4 w-4" />
					Time Out
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>End your shift?</DialogTitle>
					<DialogDescription>
						This records your Time Out and locks the dashboard until your
						next scheduled Time In.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => setOpen(false)}
						disabled={isSubmitting}
					>
						Cancel
					</Button>
					<Button
						onClick={handleTimeOut}
						disabled={isSubmitting}
						className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
					>
						{isSubmitting ? (
							<>
								<Loader2 className="h-4 w-4 animate-spin" /> Timing out…
							</>
						) : (
							"Time Out"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
