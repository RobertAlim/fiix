// components/auth/sign-out-button.tsx
"use client";

import { SignOutButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export function SignOutBtn() {
	return (
		<SignOutButton redirectUrl="/sign-in">
			<Button variant="outline">Sign out</Button>
		</SignOutButton>
	);
}
