"use client";

// components/ui/radio-card.tsx
//
// Radix RadioGroup rendered as a row of selectable "cards" instead of the
// usual dot-and-label list — used wherever a small, mutually-exclusive set
// of states benefits from being visually distinct at a glance (e.g. printer
// Status: Active / Inactive / Missing). Each item carries its own color
// theme, applied purely through Radix's data-state attribute (no JS
// checked-tracking needed), so the selected state reads as "green card" /
// "blue card" / "red card" rather than a plain checked radio dot.
//
// Usage:
//   <RadioCardGroup value={status} onValueChange={setStatus}>
//     <RadioCardItem value="Active" label="Active" icon={<CircleCheck />} color="green" />
//     <RadioCardItem value="Inactive" label="Inactive" icon={<CircleMinus />} color="blue" />
//     <RadioCardItem value="Missing" label="Missing" icon={<MapPinOff />} color="red" />
//   </RadioCardGroup>

import * as React from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { cn } from "@/lib/utils";

function RadioCardGroup({
	className,
	...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
	return (
		<RadioGroupPrimitive.Root
			data-slot="radio-card-group"
			className={cn("grid grid-cols-3 gap-2", className)}
			{...props}
		/>
	);
}

export type RadioCardColor = "green" | "blue" | "red";

/** Every class here is literal (not string-built) so Tailwind's JIT scanner
 * can see it — the checked/unchecked swap happens purely via Radix's
 * data-state attribute, not React state. */
const COLOR_STYLES: Record<RadioCardColor, string> = {
	green: cn(
		"data-[state=checked]:border-emerald-500 data-[state=checked]:bg-emerald-50",
		"data-[state=checked]:text-emerald-700 data-[state=checked]:ring-1 data-[state=checked]:ring-emerald-500",
		"dark:data-[state=checked]:bg-emerald-950/40 dark:data-[state=checked]:text-emerald-300 dark:data-[state=checked]:border-emerald-500",
		"[&_[data-slot=radio-card-dot]]:bg-emerald-500"
	),
	blue: cn(
		"data-[state=checked]:border-blue-500 data-[state=checked]:bg-blue-50",
		"data-[state=checked]:text-blue-700 data-[state=checked]:ring-1 data-[state=checked]:ring-blue-500",
		"dark:data-[state=checked]:bg-blue-950/40 dark:data-[state=checked]:text-blue-300 dark:data-[state=checked]:border-blue-500",
		"[&_[data-slot=radio-card-dot]]:bg-blue-500"
	),
	red: cn(
		"data-[state=checked]:border-red-500 data-[state=checked]:bg-red-50",
		"data-[state=checked]:text-red-700 data-[state=checked]:ring-1 data-[state=checked]:ring-red-500",
		"dark:data-[state=checked]:bg-red-950/40 dark:data-[state=checked]:text-red-300 dark:data-[state=checked]:border-red-500",
		"[&_[data-slot=radio-card-dot]]:bg-red-500"
	),
};

interface RadioCardItemProps
	extends React.ComponentProps<typeof RadioGroupPrimitive.Item> {
	label: string;
	color: RadioCardColor;
	icon?: React.ReactNode;
}

function RadioCardItem({
	className,
	label,
	color,
	icon,
	...props
}: RadioCardItemProps) {
	return (
		<RadioGroupPrimitive.Item
			data-slot="radio-card-item"
			className={cn(
				"group relative flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-left text-sm font-medium text-foreground transition-all",
				"hover:border-muted-foreground/40",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
				"data-[state=checked]:shadow-sm",
				COLOR_STYLES[color],
				className
			)}
			{...props}
		>
			{icon && (
				<span className="shrink-0 [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
			)}
			<span className="flex-1 truncate">{label}</span>
			<RadioGroupPrimitive.Indicator asChild forceMount>
				<span
					data-slot="radio-card-dot"
					className="h-2 w-2 shrink-0 rounded-full bg-transparent opacity-0 transition-opacity data-[state=checked]:opacity-100 group-data-[state=checked]:opacity-100"
				/>
			</RadioGroupPrimitive.Indicator>
		</RadioGroupPrimitive.Item>
	);
}

export { RadioCardGroup, RadioCardItem };
