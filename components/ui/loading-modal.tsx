// components/ui/loading-spinner-modal.tsx

import React from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog"; // Ensure correct path for shadcn/ui Dialog
import { cn } from "@/lib/utils"; // Assuming you have shadcn's cn utility for combining classNames

interface LoadingSpinnerModalProps {
	isOpen: boolean;
	message?: string; // Optional message to display
}

export const LoadingSpinnerModal: React.FC<LoadingSpinnerModalProps> = ({
	isOpen,
	message = "Loading...",
}) => {
	return (
		<Dialog open={isOpen}>
			<DialogContent
				// Override default shadcn/ui behavior to make it non-dismissible
				className={cn(
					"w-fit rounded-lg shadow-lg p-8 flex flex-col items-center justify-center",
					"data-[state=open]:animate-in data-[state=closed]:animate-out",
					"data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
					"data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
					"data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]",
					"data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
					"sm:max-w-xs", // Make it smaller for a loading modal
					"pointer-events-none", // Prevent clicks on elements behind the modal
					"bg-white/80 backdrop-blur-sm" // Semi-transparent background
				)}
				onPointerDownOutside={(e) => e.preventDefault()} // Prevent closing on outside click
				onEscapeKeyDown={(e) => e.preventDefault()} // Prevent closing on Escape key
			>
				<DialogHeader>
					<DialogTitle></DialogTitle>
				</DialogHeader>
				{/* Simple CSS Spinner */}
				<div className="animate-spin rounded-full h-12 w-12 border-4 border-t-4 border-t-blue-500 border-gray-200 mb-4"></div>

				{/* Loading Message */}
				<p className="text-lg font-semibold text-gray-700">{message}</p>
			</DialogContent>
		</Dialog>
	);
};

// Optional: You can also use an icon from lucide-react if you have it installed
// import { Loader2 } from 'lucide-react';
/*
<Loader2 className="h-12 w-12 animate-spin text-blue-500 mb-4" />
*/
