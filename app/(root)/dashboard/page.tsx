"use client";

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

import {
	LayoutDashboard,
	Menu,
	Wrench,
	ListTodo,
	FileText,
	CalendarCheck,
	CircleUserRound,
	ChevronLeft,
	Printer,
	ShieldCheck,
	Lock,
	DatabaseZap,
	MapPin,
	MessageSquare,
	FileSpreadsheet,
	History,
	Satellite,
} from "lucide-react";
import { useUserStore } from "@/state/userStore";
import { useDBUser } from "@/hooks/use-db-user";
import { useQueries } from "@tanstack/react-query";
import { SignOutBtn } from "@/components/auth/sign-out-button";
import { canAccessModule, ModuleKey } from "@/lib/permissions";
import { OfflineSyncProvider } from "@/features/offline-sync/OfflineSyncProvider";
import { SyncStatusIndicator } from "@/components/SyncStatusIndicator";
import { OpenIssuesBell } from "@/components/OpenIssuesBell";
import { AttendanceGate } from "@/components/TimeInScreen";
import { TimeOutButton } from "@/components/TimeOutButton";
import {
	fetchPartsCached,
	fetchStatusCached,
} from "@/features/offline-sync";

const MaintenancePage = dynamic(() => import("@/components/pages/Maintenance"));
const TaskTrackerPage = dynamic(() => import("@/components/pages/TaskTracker"));
const ReportPage = dynamic(() => import("@/components/pages/Report"));
const SchedulePage = dynamic(() => import("@/components/pages/Schedule"));
const DashboardRealPage = dynamic(() => import("@/components/pages/Dashboard"));
const RoleAssignmentPage = dynamic(
	() => import("@/components/pages/RoleAssignment")
);
const DataImportPage = dynamic(() => import("@/components/pages/DataImport"));
const PrintersPage = dynamic(() => import("@/components/pages/Printers"));
const LocationGeofencesPage = dynamic(
	() => import("@/components/pages/LocationGeofences")
);
const SmsRecipientsPage = dynamic(() => import("@/components/pages/SmsRecipients"));
const AttendanceReportPage = dynamic(
	() => import("@/components/pages/AttendanceReport")
);
const PurgeMaintenancePage = dynamic(
	() => import("@/components/pages/PurgeMaintenance")
);
const GpsMonitoringPage = dynamic(
	() => import("@/components/pages/GpsMonitoring")
);

type PageKey = ModuleKey;

const ALL_NAV_ITEMS: { key: PageKey; label: string; icon: React.ElementType }[] = [
	{ key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
	{ key: "maintenance", label: "Maintenance", icon: Wrench },
	{ key: "taskTracker", label: "Task Tracker", icon: ListTodo },
	{ key: "report", label: "Report", icon: FileText },
	{ key: "schedule", label: "Schedule", icon: CalendarCheck },
	{ key: "roleAssignment", label: "Role Assignment", icon: ShieldCheck },
	{ key: "dataImport", label: "Data Import", icon: DatabaseZap },
	{ key: "printers", label: "Printers", icon: Printer },
	{ key: "locationGeofences", label: "Client Locations", icon: MapPin },
	{ key: "smsRecipients", label: "SMS Recipients", icon: MessageSquare },
	{ key: "attendanceReport", label: "Attendance Report", icon: FileSpreadsheet },
	{ key: "purgeMaintenance", label: "Purge Maintenance", icon: History },
	{ key: "gpsMonitoring", label: "GPS Monitoring", icon: Satellite },
];

const PAGE_TITLES: Record<PageKey, string> = {
	dashboard: "Dashboard",
	maintenance: "Maintenance",
	taskTracker: "Task Tracker",
	report: "Report",
	schedule: "Schedule",
	roleAssignment: "Role Assignment",
	dataImport: "Data Import",
	printers: "Printers",
	locationGeofences: "Client Locations",
	smsRecipients: "SMS Recipients",
	attendanceReport: "Attendance Report",
	purgeMaintenance: "Purge Maintenance",
	gpsMonitoring: "GPS Monitoring",
};

function NotAuthorized() {
	return (
		<div className="flex flex-col items-center justify-center gap-3 rounded-2xl border bg-card p-12 text-center">
			<div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/15">
				<Lock className="h-6 w-6 text-warning" />
			</div>
			<p className="font-medium">You don&apos;t have access to this module.</p>
			<p className="text-sm text-muted-foreground">
				Contact your administrator if you believe this is a mistake.
			</p>
		</div>
	);
}

export default function DashboardPage() {
	const { data } = useDBUser();
	const { users, setUsers } = useUserStore();
	const [activePage, setActivePage] = useState<PageKey>("dashboard");
	const [collapsed, setCollapsed] = useState(false);
	const [selectedserialNo, setSelectedSerialNo] = useState<string>("");
	const [selectedOriginMTId, setSelectedOriginMTId] = useState<number>(0);
	const [selectedSchedDetailsId, setSelectedSchedDetailsId] = useState(0);
	const [signPath, setSignPath] = useState("");
	const [mtId, setMtId] = useState<number>(0);

	const queries = useQueries({
		queries: [
			{
				queryKey: ["parts"],
				queryFn: () => fetchPartsCached(),
			},
			{
				queryKey: ["status"],
				queryFn: () => fetchStatusCached(),
			},
		],
	});

	const [parts, status] = queries;

	useEffect(() => {
		if (data) {
			setUsers(data);
		}
	}, [data, setUsers]);

	// Frontend nav filtering — the real security boundary is the API layer
	// (requireRole on each route), this only controls what's shown/reachable
	// in the UI. Middleware has already confirmed the account is active and
	// has a role before this component ever renders.
	const navItems = useMemo(
		() => ALL_NAV_ITEMS.filter((item) => canAccessModule(users?.role, item.key)),
		[users?.role]
	);

	const isTechnician = users?.role === "Technician";

	// If the user's current tab is no longer permitted (e.g. role changed
	// mid-session), fall back to Dashboard rather than showing a blocked page.
	useEffect(() => {
		if (users?.role && !canAccessModule(users.role, activePage)) {
			setActivePage("dashboard");
		}
	}, [users?.role, activePage]);

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
			setActivePage("dashboard");
			setSignPath(maintainSignPath);
			setMtId(mtId ?? 0);
		} else {
			setActivePage("maintenance");
			setSelectedSerialNo(serialNo);
			setSelectedOriginMTId(originMTId);
			setSelectedSchedDetailsId(schedDetailsId);
			setSignPath("");
		}
	};

	const renderContent = () => {
		// Defense in depth: even if a nav item were reachable via manipulated
		// client state, block the render here too. The APIs each page calls
		// enforce the same rule server-side regardless.
		if (!canAccessModule(users?.role, activePage)) {
			return <NotAuthorized />;
		}

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
			case "roleAssignment":
				return <RoleAssignmentPage />;
			case "dataImport":
				return <DataImportPage />;
			case "printers":
				return <PrintersPage />;
			case "locationGeofences":
				return <LocationGeofencesPage />;
			case "smsRecipients":
				return <SmsRecipientsPage />;
			case "attendanceReport":
				return <AttendanceReportPage />;
			case "purgeMaintenance":
				return <PurgeMaintenancePage onClose={() => setActivePage("dashboard")} />;
			case "gpsMonitoring":
				return <GpsMonitoringPage />;
			default:
				return <div>Page not found!</div>;
		}
	};

	const initials =
		`${users?.firstName?.[0] ?? ""}${users?.lastName?.[0] ?? ""}`.toUpperCase() ||
		"U";
	const fullName =
		[users?.firstName, users?.lastName].filter(Boolean).join(" ") || "";

	const NavList = () => (
		<nav className="flex-1 min-h-0 overflow-y-auto space-y-1 px-3">
			{navItems.map(({ key, label, icon: Icon }) => {
				const active = activePage === key;
				return (
					<button
						key={key}
						onClick={() => setActivePage(key)}
						title={collapsed ? label : undefined}
						className={cn(
							"flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
							"text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
							active &&
								"bg-white text-primary shadow-sm hover:bg-white hover:text-primary"
						)}
					>
						<Icon className="h-5 w-5 shrink-0" />
						{!collapsed && <span>{label}</span>}
					</button>
				);
			})}
		</nav>
	);

	return (
		<OfflineSyncProvider>
		<AttendanceGate isTechnician={isTechnician} firstName={users?.firstName}>
		<div className="min-h-screen flex bg-background">
			{/* Desktop sidebar */}
			<aside
				className={cn(
					"hidden md:flex flex-col min-h-0 bg-sidebar text-sidebar-foreground transition-all duration-200",
					collapsed ? "w-20" : "w-64"
				)}
			>
				<div className="flex items-center gap-2 px-4 py-6">
					<div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
						<Printer className="h-5 w-5" />
					</div>
					{!collapsed && (
						<span className="text-lg font-bold tracking-tight">Fiix</span>
					)}
				</div>

				<NavList />

				<div className="mt-auto space-y-1 px-3 pb-4">
					<Link
						href="/profile"
						className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
					>
						<CircleUserRound className="h-5 w-5 shrink-0" />
						{!collapsed && <span>Profile</span>}
					</Link>
					<SignOutBtn collapsed={collapsed} />
					<button
						onClick={() => setCollapsed((c) => !c)}
						className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-sidebar-border px-3 py-2 text-xs font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent"
					>
						<ChevronLeft
							className={cn(
								"h-4 w-4 transition-transform",
								collapsed && "rotate-180"
							)}
						/>
						{!collapsed && <span>Collapse</span>}
					</button>
				</div>
			</aside>

			<div className="flex-1 flex flex-col min-w-0">
				{/* Topbar */}
				<header className="flex items-center justify-between gap-3 border-b bg-card px-4 py-3 md:px-6">
					<div className="flex items-center gap-2">
						<Sheet>
							<SheetTrigger asChild>
								<Button variant="ghost" size="icon" className="md:hidden">
									<Menu className="h-5 w-5" />
								</Button>
							</SheetTrigger>
							<SheetContent
								side="left"
								className="w-72 bg-sidebar text-sidebar-foreground p-0 border-0 flex flex-col"
							>
								<SheetTitle className="sr-only">Navigation menu</SheetTitle>
								<div className="flex items-center gap-2 px-4 py-6">
									<div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
										<Printer className="h-5 w-5" />
									</div>
									<span className="text-lg font-bold tracking-tight">Fiix</span>
								</div>
								<SheetNav
									navItems={navItems}
									activePage={activePage}
									setActivePage={setActivePage}
								/>
							</SheetContent>
						</Sheet>
						<h1 className="text-lg font-semibold capitalize md:text-xl">
							{PAGE_TITLES[activePage]}
						</h1>
					</div>

					<div className="flex items-center gap-2 md:gap-4">
						<SyncStatusIndicator />
						<ThemeToggle />
						{/* Only Admin/Scheduler can read /api/open-issues, so the bell
						    is hidden for Technicians rather than showing an empty badge. */}
						<OpenIssuesBell
							enabled={canAccessModule(users?.role, "schedule")}
						/>
						{isTechnician && <TimeOutButton />}
						<div className="flex items-center gap-2 pl-2 md:border-l">
							<Avatar className="h-8 w-8">
								<AvatarFallback className="bg-primary text-primary-foreground text-xs">
									{initials}
								</AvatarFallback>
							</Avatar>
							{fullName && (
								<div className="hidden text-sm leading-tight md:block">
									<p className="font-medium">{fullName}</p>
									<p className="text-xs text-muted-foreground">
										{users?.role || "User"}
									</p>
								</div>
							)}
						</div>
					</div>
				</header>

				{/* Page Content */}
				<main className="flex-1 overflow-x-hidden p-4 md:p-6">
					{renderContent()}
				</main>
			</div>
		</div>
		</AttendanceGate>
		</OfflineSyncProvider>
	);
}

function SheetNav({
	navItems,
	activePage,
	setActivePage,
}: {
	navItems: { key: PageKey; label: string; icon: React.ElementType }[];
	activePage: PageKey;
	setActivePage: (p: PageKey) => void;
}) {
	return (
		<nav className="flex-1 min-h-0 overflow-y-auto space-y-1 px-3">
			{navItems.map(({ key, label, icon: Icon }) => {
				const active = activePage === key;
				return (
					<button
						key={key}
						onClick={() => setActivePage(key)}
						className={cn(
							"flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
							"text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
							active && "bg-white text-primary shadow-sm"
						)}
					>
						<Icon className="h-5 w-5 shrink-0" />
						<span>{label}</span>
					</button>
				);
			})}
			<Link
				href="/profile"
				className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent"
			>
				<CircleUserRound className="h-5 w-5 shrink-0" />
				<span>Profile</span>
			</Link>
			<div className="pt-1">
				<SignOutBtn />
			</div>
		</nav>
	);
}
