"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldAlert, UserCog } from "lucide-react";
import { SignOutBtn } from "@/components/auth/sign-out-button";

function AccountPendingContent() {
	const searchParams = useSearchParams();
	const reason = searchParams.get("reason");

	const isNoRole = reason === "no-role";

	return (
		<div className="flex min-h-screen items-center justify-center bg-background p-4">
			<Card className="w-full max-w-md rounded-2xl border shadow-sm">
				<CardContent className="flex flex-col items-center gap-4 p-8 text-center">
					<div className="flex h-14 w-14 items-center justify-center rounded-full bg-warning/15">
						{isNoRole ? (
							<UserCog className="h-7 w-7 text-warning" />
						) : (
							<ShieldAlert className="h-7 w-7 text-warning" />
						)}
					</div>

					<h1 className="text-lg font-semibold">
						{isNoRole ? "Awaiting Role Assignment" : "Account Pending Activation"}
					</h1>

					<p className="text-sm text-muted-foreground">
						{isNoRole
							? "Your account is active but has not been assigned a role yet. Please contact your administrator to have a role assigned."
							: "Account is not yet set as active by Admin. Please contact your administrator to ask for permission."}
					</p>

					<div className="pt-2">
						<SignOutBtn />
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

export default function AccountPendingPage() {
	return (
		<Suspense fallback={null}>
			<AccountPendingContent />
		</Suspense>
	);
}
