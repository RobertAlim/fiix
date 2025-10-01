"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/ThemeToggle";

import {
	LayoutDashboard,
	Menu,
	Wrench,
	ListTodo,
	FileText,
	CalendarCheck,
	CircleUserRound,
	LogOut,
} from "lucide-react";
import { useUserStore } from "@/state/userStore";
import { useDBUser } from "@/hooks/use-db-user";
import { useQueries } from "@tanstack/react-query";
import { SignOutBtn } from "@/components/auth/sign-out-button";

const MaintenancePage = dynamic(() => import("@/components/pages/Maintenance"));
const TaskTrackerPage = dynamic(() => import("@/components/pages/TaskTracker"));
const ReportPage = dynamic(() => import("@/components/pages/Report"));
const SchedulePage = dynamic(() => import("@/components/pages/Schedule"));
const DashboardRealPage = dynamic(() => import("@/components/pages/Dashboard"));

export default function DashboardPage() {
	const { data } = useDBUser();
	const { setUsers } = useUserStore();
	const [activePage, setActivePage] = useState("dashboard");
	const [selectedserialNo, setSelectedSerialNo] = useState<string>("");
	const [selectedOriginMTId, setSelectedOriginMTId] = useState<number>(0);
	const [selectedSchedDetailsId, setSelectedSchedDetailsId] = useState(0);
	const [signPath, setSignPath] = useState("");
	const [mtId, setMtId] = useState<number>(0);

	const queries = useQueries({
		queries: [
			{
				queryKey: ["parts"],
				queryFn: async () => {
					const res = await fetch("/api/dropdown/parts");
					if (!res.ok) throw new Error("Failed to fetch parts");
					return res.json();
				},
			},
			{
				queryKey: ["status"],
				queryFn: async () => {
					const res = await fetch("/api/dropdown/status");
					if (!res.ok) throw new Error("Failed to fetch status");
					return res.json();
				},
			},
		],
	});

	const [parts, status] = queries;

	// Optionally hydrate Zustand
	useEffect(() => {
		if (data) {
			setUsers(data); // Assuming data is an array and we want the first user
		}
	}, [data, setUsers]);

	// useEffect(() => {
	// 	if (activePage) {
	// 		setActivePage("maintenance");
	// 	}
	// }, [activePage]);

	const handleCardClick = ({
		serialNo,
		originMTId,
		schedDetailsId,
		maintainSignPath,
		mtId,
	}: {
		serialNo: string;
		originMTId: number;
		schedDetailsId: number;
		maintainSignPath: string | null | undefined;
		mtId: number | undefined;
	}) => {
		if (maintainSignPath && maintainSignPath === "Unsigned") {
			console.log("Clicked Card with Serial No: Dashboard");
			setActivePage("dashboard");
			setSignPath(maintainSignPath);
			setMtId(mtId ?? 0);
		} else {
			console.log("Clicked Card with Serial No: Maintenance");
			setActivePage("maintenance");
			setSelectedSerialNo(serialNo);
			setSelectedOriginMTId(originMTId);
			setSelectedSchedDetailsId(schedDetailsId);
			setSignPath("");
		}
	};

	const renderContent = () => {
		switch (activePage) {
			case "dashboard":
				return (
					<DashboardRealPage
						onCardClick={handleCardClick}
						signPath={signPath}
						mtId={mtId}
					/>
				);
			case "maintenance":
				return (
					<MaintenancePage
						parts={parts.data ?? []}
						status={status.data ?? []}
						serialNo={selectedserialNo}
						originMTId={selectedOriginMTId}
						schedDetailsId={selectedSchedDetailsId}
					/>
				);
			case "taskTracker":
				return <TaskTrackerPage />;
			case "report":
				return <ReportPage />;
			case "schedule":
				return <SchedulePage />;
			default:
				return <div>Page not found!</div>;
		}
	};

	return (
		<div className="min-h-screen flex">
			{/* Left Drawer */}
			<aside className="w-64 bg-gray-100 p-4 hidden md:block">
				<span className="text-xl font-semibold mb-4">Menu</span>
				<nav className="space-y-2">
					<Link
						href="/profile"
						className="block text-gray-700 hover:text-black"
					>
						<div className="flex items-center gap-1">
							<CircleUserRound className="w-5 h-5" /> Profile
						</div>
					</Link>

					<div className="flex items-center gap-1 text-gray-700 hover:text-black">
						<LogOut className="w-5 h-5" />
						<SignOutBtn />
					</div>
				</nav>
			</aside>

			<div className="flex-1 flex flex-col ">
				{/* Top Menu */}
				<header className="bg-white shadow px-4 py-3 flex items-center justify-between dark:bg-gray-900 text-black dark:text-white">
					{/* Mobile Drawer Trigger */}
					<Sheet>
						<SheetTrigger asChild>
							<Button variant="ghost" className="md:hidden">
								<Menu className="h-6 w-6" />
							</Button>
						</SheetTrigger>
						<SheetContent
							side="left"
							className="w-64 bg-gray-100 dark:bg-gray-900 text-black dark:text-white p-4"
						>
							<SheetTitle>
								<span className="text-xl font-semibold mb-4">Menu</span>
							</SheetTitle>

							<nav className="space-y-2">
								<Link
									href="/profile"
									className="block text-gray-700 hover:text-black"
								>
									Profile
								</Link>
								<Link
									href="/logout"
									className="block text-gray-700 hover:text-black"
								>
									Logout
								</Link>
							</nav>
						</SheetContent>
					</Sheet>

					{/* Main Nav */}
					<nav className="flex items-center space-x-6">
						<button
							onClick={() => setActivePage("dashboard")}
							className="text-gray-700 hover:text-black hidden md:inline"
						>
							<div className="flex justify-center items-center gap-1">
								<LayoutDashboard className="h-5 w-5" />
								Dashboard
							</div>
						</button>
						<button
							onClick={() => setActivePage("dashboard")}
							className="text-gray-700 hover:text-black md:hidden"
						>
							<LayoutDashboard className="h-5 w-5" />
						</button>
						<button
							onClick={() => setActivePage("maintenance")}
							className="text-gray-700 hover:text-black hidden md:inline"
						>
							<div className="flex justify-center items-center gap-1">
								<Wrench className="h-5 w-5" />
								Maintenance
							</div>
						</button>
						<button
							onClick={() => setActivePage("maintenance")}
							className="text-gray-700 hover:text-black md:hidden"
						>
							<Wrench className="h-5 w-5" />
						</button>

						<button
							onClick={() => setActivePage("taskTracker")}
							className="text-gray-700 hover:text-black hidden md:inline"
						>
							<div className="flex justify-center items-center gap-1">
								<ListTodo className="h-5 w-5" />
								Task Tracker
							</div>
						</button>
						<button
							onClick={() => setActivePage("taskTracker")}
							className="text-gray-700 hover:text-black md:hidden"
						>
							<ListTodo className="h-5 w-5" />
						</button>

						<button
							onClick={() => setActivePage("report")}
							className="text-gray-700 hover:text-black hidden md:inline"
						>
							<div className="flex justify-center items-center gap-1">
								<FileText className="h-5 w-5" />
								Report
							</div>
						</button>
						<button
							onClick={() => setActivePage("report")}
							className="text-gray-700 hover:text-black md:hidden"
						>
							<FileText className="h-5 w-5" />
						</button>

						<button
							onClick={() => setActivePage("schedule")}
							className="text-gray-700 hover:text-black hidden md:inline"
						>
							<div className="flex justify-center items-center gap-1">
								<CalendarCheck className="h-5 w-5" />
								Schedule
							</div>
						</button>
						<button
							onClick={() => setActivePage("schedule")}
							className="text-gray-700 hover:text-black md:hidden"
						>
							<CalendarCheck className="h-5 w-5" />
						</button>

						<ThemeToggle />
					</nav>
				</header>

				{/* Page Content */}
				<main className="flex-1 p-4">
					<h1 className="text-2xl font-bold mb-4 capitalize">{activePage}</h1>
					{renderContent()}
				</main>
			</div>
		</div>
	);
}

// function DashboardContent() {

// }
