"use client";

import React, { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
	LineChart,
	Line,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUserStore } from "@/state/userStore";
import { SchedulesDataTable } from "@/components/TechnicianSchedules";
import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Signature,
	Printer,
	CheckCircle2,
	Clock,
	CalendarClock,
} from "lucide-react";
import SignaturePad from "@/components/SignaturePad";
import { v4 as uuidv4 } from "uuid";
import { base64ToFile } from "@/lib/fileConverter";
import { showAppToast } from "../ui/apptoast";
import { OfflineSyncWidgets } from "@/components/OfflineSyncWidgets";

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
}

interface PatchBody {
	id: number;
	signPath: string;
}

interface DashboardStats {
	totalPrinters: number;
	completedThisMonth: number;
	pending: number;
	upcomingSchedules: number;
	trend: { day: string; completed: number }[];
}

const STAT_CARDS: {
	key: keyof Pick<
		DashboardStats,
		"totalPrinters" | "completedThisMonth" | "pending" | "upcomingSchedules"
	>;
	label: string;
	icon: React.ElementType;
	badgeClass: string;
}[] = [
	{
		key: "totalPrinters",
		label: "Deployed Printers",
		icon: Printer,
		badgeClass: "bg-primary text-primary-foreground",
	},
	{
		key: "completedThisMonth",
		label: "Completed This Month",
		icon: CheckCircle2,
		badgeClass: "bg-success text-success-foreground",
	},
	{
		key: "pending",
		label: "Pending Maintenance",
		icon: Clock,
		badgeClass: "bg-warning text-warning-foreground",
	},
	{
		key: "upcomingSchedules",
		label: "Upcoming Schedules",
		icon: CalendarClock,
		badgeClass: "bg-info text-info-foreground",
	},
];

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

	const { users } = useUserStore();

	const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
		queryKey: ["dashboard-stats"],
		queryFn: async () => {
			const res = await fetch("/api/dashboard-stats");
			if (!res.ok) throw new Error("Failed to fetch dashboard stats");
			return res.json();
		},
	});

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
	};

	const handleSaveSign = async (sig: string) => {
		if (mtId === null || !sig) {
			console.error("Missing Maintenance ID or Sign Path data.");
			return;
		}

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
			const signBlob = base64ToFile(sig!, uuidSignFileName);
			const { url } = await getUrlRespSign.json();

			const uploadResponseSign = await fetch(url, {
				method: "PUT",
				headers: { "Content-Type": contentType },
				body: signBlob,
			});

			if (!uploadResponseSign.ok) {
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

		try {
			const res = await fetch("/api/maintain", {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(patchBody),
			});

			if (!res.ok) {
				const errorData = await res
					.json()
					.catch(() => ({ message: res.statusText }));
				console.error(`API Error (${res.status}):`, errorData);
				return;
			}

			setESignOpen(false);
			onSignSuccess();
		} catch (error) {
			console.error("Network or Fetch Error:", error);
		}
	};

	return (
		<div className="space-y-6">
			{/* Greeting */}
			<div>
				<h2 className="text-2xl font-bold tracking-tight">
					Hello, {users?.firstName || "there"}
					<span className="ml-2">👋</span>
				</h2>
				<p className="text-sm text-muted-foreground">
					{formattedFullDate} — here&apos;s what&apos;s happening today.
				</p>
			</div>

			{/* Offline sync & GPS status */}
			<OfflineSyncWidgets />

			{/* Stat cards */}
			<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
				{STAT_CARDS.map(({ key, label, icon: Icon, badgeClass }) => (
					<Card key={key} className="rounded-2xl border shadow-sm">
						<CardContent className="p-5">
							<div className="flex items-start justify-between">
								<div>
									<p className="text-sm text-muted-foreground">{label}</p>
									<p className="mt-1 text-3xl font-bold">
										{statsLoading ? "—" : stats?.[key] ?? 0}
									</p>
								</div>
								<div
									className={`flex h-10 w-10 items-center justify-center rounded-xl ${badgeClass}`}
								>
									<Icon className="h-5 w-5" />
								</div>
							</div>
						</CardContent>
					</Card>
				))}
			</div>

			{/* Itinerary + Chart — stacked, Itinerary first */}
			<div className="flex flex-col gap-4">
				<Card className="min-w-0 rounded-2xl border shadow-sm">
					<CardHeader>
						<CardTitle className="text-base font-semibold">
							{users.role === "Technician" ? "Your Itinerary Today" : "Overview"}
						</CardTitle>
					</CardHeader>
					<CardContent>
						{users.role === "Technician" ? (
							<SchedulesDataTable
								technicianId={users.id}
								scheduledAt={formattedDate}
								onCardClick={onCardClick}
							/>
						) : (
							<p className="text-sm text-muted-foreground">
								Assign yourself as a technician to see a daily itinerary here.
							</p>
						)}
					</CardContent>
				</Card>

				<Card className="min-w-0 rounded-2xl border shadow-sm">
					<CardHeader>
						<CardTitle className="text-base font-semibold">
							Maintenance Completed — Last 7 Days
						</CardTitle>
					</CardHeader>
					<CardContent className="h-64 pl-0">
						{stats?.trend && stats.trend.length > 0 ? (
							<ResponsiveContainer width="100%" height="100%">
								<LineChart data={stats.trend}>
									<CartesianGrid strokeDasharray="3 3" vertical={false} />
									<XAxis dataKey="day" fontSize={12} tickLine={false} axisLine={false} />
									<YAxis
										allowDecimals={false}
										fontSize={12}
										tickLine={false}
										axisLine={false}
									/>
									<Tooltip />
									<Line
										type="monotone"
										dataKey="completed"
										stroke="var(--color-success)"
										strokeWidth={2}
										dot={{ r: 3 }}
									/>
								</LineChart>
							</ResponsiveContainer>
						) : (
							<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
								{statsLoading ? "Loading…" : "No maintenance activity yet this week."}
							</div>
						)}
					</CardContent>
				</Card>
			</div>

			<Dialog open={eSignOpen} onOpenChange={setESignOpen}>
				<DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
					<DialogHeader>
						<DialogTitle>
							<div className="flex items-center justify-between rounded-xl bg-muted p-4">
								<h1 className="text-xl font-semibold">Signatory</h1>
								<Signature className="w-8 h-8 text-success" />
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
