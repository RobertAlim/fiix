// components/auth/sign-out-button.tsx
"use client";

import { SignOutButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The icon lives INSIDE the button, not beside it — the previous layout put a
 * standalone <LogOut/> next to an outline Button whose own label then
 * collapsed against the dark sidebar background.
 *
 * `collapsed` renders the icon-only form used by the narrow desktop sidebar;
 * the label is kept as sr-only text so the control stays accessible.
 */
export function SignOutBtn({
	collapsed = false,
	className,
}: {
	collapsed?: boolean;
	className?: string;
}) {
	return (
		<SignOutButton redirectUrl="/sign-in">
			<Button
				variant="outline"
				title={collapsed ? "Sign out" : undefined}
				className={cn(
					"w-full gap-3 border-sidebar-border bg-transparent text-sidebar-foreground/80",
					"hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
					collapsed ? "justify-center px-0" : "justify-start px-3",
					className
				)}
			>
				<LogOut className="h-5 w-5 shrink-0" />
				<span className={collapsed ? "sr-only" : "text-sm font-medium"}>
					Sign out
				</span>
			</Button>
		</SignOutButton>
	);
}
