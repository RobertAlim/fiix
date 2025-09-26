"use client";

import React from "react";

import { Card, CardContent } from "@/components/ui/card";
import { useUserStore } from "@/state/userStore";
import { SchedulesDataTable } from "@/components/TechnicianSchedules";
import { CameraCapture } from "../CameraCapture";

// Define the props interface for DashboardRealPage
interface DashboardRealPageProps {
	onCardClick: (args: {
		serialNo: string;
		originMTId: number;
		schedDetailsId: number;
	}) => void;
	// Add any other props DashboardRealPage might need
}

export default function DashboardPage({ onCardClick }: DashboardRealPageProps) {
	const { users } = useUserStore();

	// State to control which page is currently displayed
	// const [activePage, setActivePage] = useState("dashboard");
	// New state to hold the originMTId from the clicked card

	const formattedDate = new Intl.DateTimeFormat("en-US").format(new Date());
	const formattedFullDate = formatFullDate(new Date());

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
						{/* <div>
							<CameraCapture />
						</div> */}
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
