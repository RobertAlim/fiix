// components/apptoast.tsx
"use client";

import { toast } from "sonner";
import {
	LucideIcon,
	TriangleAlert,
	CircleCheckBig,
	InfoIcon,
	OctagonX,
	X,
} from "lucide-react";
import React from "react"; // Make sure React is imported

// Define the shape of the props for our toast function
interface ShowAppToastProps {
	message: string;
	description?: string;
	duration?: number; // Duration in milliseconds
	icon?: React.ReactNode | LucideIcon; // Can be a custom React node or a LucideIcon component
	color?: "info" | "warning" | "error" | "success" | "default"; // Simplified color types for convenience
	position?:
		| "top-left"
		| "top-center"
		| "top-right"
		| "bottom-left"
		| "bottom-center"
		| "bottom-right";
}

// A helper function to get the default icon based on color type
const getDefaultIconElement = (
	color: ShowAppToastProps["color"]
): React.ReactNode => {
	const iconSize = "w-6 h-6";

	switch (color) {
		case "info":
			return <InfoIcon className={`${iconSize} text-blue-500`} />;
		case "warning":
			return <TriangleAlert className={`${iconSize} text-orange-500`} />;
		case "error":
			return <OctagonX className={`${iconSize} text-red-600`} />;
		case "success":
			return <CircleCheckBig className={`${iconSize} text-green-700`} />;
		default:
			return null; // No default icon for 'default' type unless specified
	}
};

let finalActionIconRender: React.ReactNode = null;
finalActionIconRender = <X className="w-4 h-4" />;

// Construct the label for the action button
const actionButtonLabel = (
	<span className="flex items-center">{finalActionIconRender}</span>
);

export const showAppToast = ({
	message,
	description,
	duration = 5000,
	color = "default",
	position = "top-right",
}: ShowAppToastProps) => {
	// Call the appropriate toast method
	toast(message, {
		description: description,
		duration: duration,
		position: position,
		action: {
			label: actionButtonLabel,
			onClick: () => toast.dismiss(),
		},
		classNames: {
			title: "font-semibold text-md",
			toast: color === "default" ? "border" : "", // Example: add border for default toast
		},
		icon: getDefaultIconElement(color), // Pass the rendered JSX element as the icon
	});
};
