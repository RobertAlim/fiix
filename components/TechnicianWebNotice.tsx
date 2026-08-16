"use client";

// components/TechnicianWebNotice.tsx
//
// Shown instead of the whole dashboard shell when a Technician signs in on
// the web. Technicians now work exclusively in the Fiix Technician mobile
// app.
//
// This is a UI redirect, NOT a revocation: every Technician page, route and
// API handler is still present and still authorizes the Technician role,
// because the mobile app calls that same API with the same Clerk session.
// Removing Technician from `MODULE_ACCESS` (lib/permissions.ts) closes the
// web shell only — deliberately, so nothing the mobile app depends on
// breaks.
import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Smartphone, Printer } from "lucide-react";
import { SignOutBtn } from "@/components/auth/sign-out-button";

export function TechnicianWebNotice({ firstName }: { firstName?: string }) {
	return (
		<div className="flex min-h-screen items-center justify-center bg-background p-4">
			<Card className="w-full max-w-md rounded-2xl border shadow-sm">
				<CardContent className="flex flex-col items-center gap-4 p-8 text-center">
					<div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
						<Smartphone className="h-7 w-7 text-primary" />
					</div>

					<div className="space-y-1">
						<p className="text-lg font-semibold">
							Technicians can now use the Fiix Technician mobile app
						</p>
						<p className="text-sm text-muted-foreground">
							{firstName ? `Hi ${firstName} — y` : "Y"}our schedules, Time
							In/Out and maintenance reports have moved to the mobile app.
							Please sign in there to start your shift.
						</p>
					</div>

					<div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
						<Printer className="h-4 w-4 shrink-0" />
						Your account and all of your records are unchanged — only the
						web view has moved.
					</div>

					<p className="text-xs text-muted-foreground">
						Think this is a mistake? Contact your Administrator.
					</p>

					<div className="w-full pt-2">
						{/* SignOutBtn's defaults are tuned for the dark sidebar
						    (sidebar-foreground on sidebar-accent); on this light
						    card those tokens wash out, so they're overridden
						    here rather than changing the shared component. */}
						<SignOutBtn className="justify-center border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground" />
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
