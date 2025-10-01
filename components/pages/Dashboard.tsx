"use client";

import React, { useEffect } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { useUserStore } from "@/state/userStore";
import { SchedulesDataTable } from "@/components/TechnicianSchedules";
import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Signature } from "lucide-react";
import SignaturePad from "@/components/SignaturePad";
import { v4 as uuidv4 } from "uuid";
import { base64ToFile } from "@/lib/fileConverter";
import { showAppToast } from "../ui/apptoast";

// Define the props interface for DashboardRealPage
interface DashboardRealPageProps {
	onCardClick: (args: {
		serialNo: string;
		originMTId: number;
		schedDetailsId: number;
		maintainSignPath: string | null | undefined;
		mtId: number | undefined;
	}) => void;
	signPath: string;
	mtId: number;
	// Add any other props DashboardRealPage might need
}

interface PatchBody {
	id: number; // Assuming mtId is a number, match this to your Zod schema
	signPath: string;
}

export default function DashboardPage({
	onCardClick,
	signPath,
	mtId,
}: DashboardRealPageProps) {
	const [eSignOpen, setESignOpen] = useState(false);

	useEffect(() => {
		if (signPath && signPath === "Unsigned") {
			setESignOpen(true);
		}
	}, [setESignOpen, signPath]);

	// console.log("Rendering DashboardPage");
	// onCardClick: ({
	// 	maintainSignPath,
	// }: {
	// 	serialNo: string;
	// 	originMTId: number;
	// 	schedDetailsId: number;
	// 	maintainSignPath: string | null | undefined;
	// }) => {
	// 	if (maintainSignPath && maintainSignPath === "Unsigned") {
	// 		setESignOpen(true);
	// 	}
	// };

	const { users } = useUserStore();

	// State to control which page is currently displayed
	// const [activePage, setActivePage] = useState("dashboard");
	// New state to hold the originMTId from the clicked card

	const formattedDate = new Intl.DateTimeFormat("en-US").format(new Date());
	const formattedFullDate = formatFullDate(new Date());

	const onSignSuccess: () => void = () => {
		showAppToast({
			message: "The signature is successfully updated.",
			description: "Successful save",
			duration: 5000,
			position: "top-center",
			color: "success",
		});
	}; // Function to call upon successful update

	const handleSaveSign = async (sig: string) => {
		// 1. Linting/Type Safety: Ensure the necessary data is available
		if (mtId === null || !sig) {
			console.error("Missing Maintenance ID or Sign Path data.");
			// Optionally show a user error notification here
			return;
		}

		// START Signature Upload to Cloudflare R2
		const uuidSignFileName = `${uuidv4()}.png`;
		const contentType = "image/png";

		const getUrlRespSign = await fetch("/api/get-upload-url", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				key: uuidSignFileName,
				contentType: contentType,
				bucketName: "fiixdrive",
			}),
		});

		if (!getUrlRespSign.ok) {
			throw new Error("Failed to get upload URL.");
		}

		if (sig) {
			// If there is a signature, proceed to upload in cloudflare R2
			const signBlob = base64ToFile(sig!, uuidSignFileName);
			const { url } = await getUrlRespSign.json();

			const uploadResponseSign = await fetch(url, {
				method: "PUT",
				headers: { "Content-Type": contentType },
				body: signBlob,
			});

			if (!uploadResponseSign.ok) {
				// Provides better debug info on failure
				const errorText = await uploadResponseSign.text();
				throw new Error(
					`Failed to upload image to R2: ${uploadResponseSign.status}. Details: ${errorText}`
				);
			}
		}

		const patchBody: PatchBody = {
			id: mtId,
			signPath: uuidSignFileName,
		};

		console.log("Attempting to PATCH signature for MtID:", mtId);

		try {
			const res = await fetch("/api/maintain", {
				method: "PATCH",
				headers: {
					// IMPORTANT: Specify that you are sending JSON
					"Content-Type": "application/json",
				},
				body: JSON.stringify(patchBody), // Use the structured data
			});

			if (!res.ok) {
				// Handle HTTP errors (400, 404, 500 etc.)
				const errorData = await res
					.json()
					.catch(() => ({ message: res.statusText }));
				console.error(`API Error (${res.status}):`, errorData);
				// Optionally show a user error notification with errorData.message
				return;
			}

			// 2. Process success response
			const { id: updatedId } = await res.json();
			console.log(`Signature update successful for ID: ${updatedId}`);

			// 3. Close the dialog and perform any other success actions
			setESignOpen(false);
			onSignSuccess(); // e.g., refresh data, show success toast
		} catch (error) {
			// Handle network errors (e.g., server unreachable)
			console.error("Network or Fetch Error:", error);
			// Show a generic network error notification
		}
	};

	// This function will be called by the Card component
	// const handleCardClick = (
	// 	serialNo: string,
	// 	originMTId: number,
	// 	schedDetailsId: number
	// ) => {
	// 	setActivePage("maintenance");
	// };

	return (
		<div className="moving-gradient-border">
			<Card className="rounded-2xl bg-white dark:bg-black">
				<CardContent className="p-6 space-y-4">
					<div className="grid grid-cols-1 gap-4">
						{users.role === "Technician" && (
							<div>
								<div>
									Good day,{" "}
									<span className="font-semibold text-green-600">
										{users.firstName}
									</span>
									! Today is{" "}
									<span className="font-semibold text-blue-400">
										{formattedFullDate}
									</span>
								</div>
								<div className="py-4">
									And here&lsquo;s your itinerary for the day.
								</div>
								<SchedulesDataTable
									technicianId={users.id}
									scheduledAt={formattedDate}
									onCardClick={onCardClick}
								/>
							</div>
						)}
					</div>
				</CardContent>
			</Card>
			<Dialog open={eSignOpen} onOpenChange={setESignOpen}>
				<DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
					<DialogHeader>
						<DialogTitle>
							<div className="flex items-center justify-between p-4 bg-gray-100 border-b mt-2">
								<h1 className="text-xl font-semibold">Signatory</h1>
								<Signature className="w-8 h-8 text-green-400" />
							</div>
						</DialogTitle>
					</DialogHeader>
					<div>
						{typeof window !== "undefined" ? (
							<SignaturePad onSave={(sig) => handleSaveSign(sig)} />
						) : (
							<p>Loading Signature Pad...</p>
						)}
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function formatFullDate(date: Date): string {
	const days = [
		"Sunday",
		"Monday",
		"Tuesday",
		"Wednesday",
		"Thursday",
		"Friday",
		"Saturday",
	];
	const months = [
		"January",
		"February",
		"March",
		"April",
		"May",
		"June",
		"July",
		"August",
		"September",
		"October",
		"November",
		"December",
	];

	const dayName = days[date.getDay()];
	const day = date.getDate();
	const month = months[date.getMonth()];
	const year = date.getFullYear();

	// Get ordinal suffix
	const suffix =
		day % 10 === 1 && day !== 11
			? "st"
			: day % 10 === 2 && day !== 12
			? "nd"
			: day % 10 === 3 && day !== 13
			? "rd"
			: "th";

	return `${dayName}, ${day}${suffix} of ${month} ${year}`;
}
