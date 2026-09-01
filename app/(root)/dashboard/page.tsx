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
import { ScrollArea } from "@/components/ui/scroll-area";
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
	ChevronDown,
	Printer,
	ShieldCheck,
	Lock,
	DatabaseZap,
	MapPin,
	MessageSquare,
	FileSpreadsheet,
	History,
	Satellite,
	ClipboardList,
	Timer,
	Navigation,
	Search,
	Building2,
} from "lucide-react";
import { useUserStore } from "@/state/userStore";
import { useDBUser } from "@/hooks/use-db-user";
import { useQueries, useQuery } from "@tanstack/react-query";
import { fetchData } from "@/lib/fetchData";
import { SignOutBtn } from "@/components/auth/sign-out-button";
import { canAccessModule, isWebBlockedRole, ModuleKey } from "@/lib/permissions";
import { OfflineSyncProvider } from "@/features/offline-sync/OfflineSyncProvider";
import { SyncStatusIndicator } from "@/components/SyncStatusIndicator";
import { OpenIssuesBell } from "@/components/OpenIssuesBell";
import { AttendanceGate } from "@/components/TimeInScreen";
import { TechnicianWebNotice } from "@/components/TechnicianWebNotice";
import { TimeOutButton } from "@/components/TimeOutButton";
import {
	fetchPartsCached,
	fetchStatusCached,
} from "@/features/offline-sync";

const MaintenancePage = dynamic(() => import("@/components/pages/Maintenance"));
const TaskTrackerPage = dynamic(() => import("@/components/pages/TaskTracker"));
// This is the ORIGINAL Report page/component, completely unchanged — it now
// lives under the Report ▸ Maintenance sub-nav (see REPORT_GROUP below)
// instead of directly under a flat "Report" link. Its own content and
// backend (/api/maintain-report) were not touched by that move.
const ReportMaintenancePage = dynamic(() => import("@/components/pages/Report"));
const MonitoringPage = dynamic(() => import("@/components/pages/Monitoring"));
const ClientsPage = dynamic(() => import("@/components/pages/Clients"));
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
const PendingMaintenancePage = dynamic(
	() => import("@/components/pages/PendingMaintenance")
);
const RelatedIssuesPage = dynamic(
	() => import("@/components/pages/RelatedIssues")
);
const TimekeepPage = dynamic(() => import("@/components/pages/Timekeep"));
const StaffGpsLocationsPage = dynamic(
	() => import("@/components/pages/StaffGpsLocations")
);

type PageKey = ModuleKey;

/** A single, directly-navigable sidebar link. */
interface NavLeaf {
	type: "leaf";
	key: PageKey;
	label: string;
	icon: React.ElementType;
}

/** A parent nav entry that isn't itself a page — clicking it (in the
 * expanded, non-collapsed sidebar) just reveals `children`; there's
 * nothing to render for the group itself. Report is the first of these
 * (Maintenance / Monitoring); built as a general shape rather than a
 * one-off special case so a future second grouped section doesn't need
 * its own parallel implementation. */
interface NavGroup {
	type: "group";
	/** Distinct from any PageKey — this never becomes `activePage`, it
	 * only keys the expand/collapse state (see `expandedGroups` below). */
	groupKey: string;
	label: string;
	icon: React.ElementType;
	children: { key: PageKey; label: string }[];
}

type NavEntry = NavLeaf | NavGroup;

const ALL_NAV_ITEMS: NavEntry[] = [
	{ type: "leaf", key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
	{ type: "leaf", key: "maintenance", label: "Maintenance", icon: Wrench },
	{ type: "leaf", key: "taskTracker", label: "Task Tracker", icon: ListTodo },
	{
		type: "group",
		groupKey: "report",
		label: "Report",
		icon: FileText,
		children: [
			// The pre-existing Report page/content, unchanged — just moved
			// under this sub-link. See ReportMaintenancePage above.
			{ key: "reportMaintenance", label: "Maintenance" },
			{ key: "reportMonitoring", label: "Monitoring" },
		],
	},
	{ type: "leaf", key: "schedule", label: "Schedule", icon: CalendarCheck },
	{ type: "leaf", key: "pendingMaintenance", label: "Pending Maintenance", icon: ClipboardList },
	{ type: "leaf", key: "relatedIssues", label: "Related Issues", icon: Search },
	{ type: "leaf", key: "timekeep", label: "Timekeep", icon: Timer },
	{ type: "leaf", key: "roleAssignment", label: "Role Assignment", icon: ShieldCheck },
	{ type: "leaf", key: "dataImport", label: "Data Import", icon: DatabaseZap },
	{ type: "leaf", key: "printers", label: "Printers", icon: Printer },
	{ type: "leaf", key: "locationGeofences", label: "Client Locations", icon: MapPin },
	{ type: "leaf", key: "clients", label: "Clients", icon: Building2 },
	{ type: "leaf", key: "staffGpsLocations", label: "Staff GPS Location", icon: Navigation },
	{ type: "leaf", key: "smsRecipients", label: "SMS Recipients", icon: MessageSquare },
	{ type: "leaf", key: "attendanceReport", label: "Attendance Report", icon: FileSpreadsheet },
	{ type: "leaf", key: "purgeMaintenance", label: "Purge Maintenance", icon: History },
	{ type: "leaf", key: "gpsMonitoring", label: "GPS Monitoring", icon: Satellite },
];

const PAGE_TITLES: Record<PageKey, string> = {
	dashboard: "Dashboard",
	maintenance: "Maintenance",
	taskTracker: "Task Tracker",
	reportMaintenance: "Report ▸ Maintenance",
	reportMonitoring: "Report ▸ Monitoring",
	schedule: "Schedule",
	pendingMaintenance: "Pending Maintenance",
	relatedIssues: "Related Issues",
	timekeep: "Timekeep",
	roleAssignment: "Role Assignment",
	dataImport: "Data Import",
	printers: "Printers",
	locationGeofences: "Client Locations",
	clients: "Clients",
	staffGpsLocations: "Staff GPS Location",
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
	// The mobile nav Sheet (below) is otherwise uncontrolled — Radix opens/
	// closes it itself via the trigger/overlay/Escape. Controlling `open`
	// here just adds one more way to close it: selecting a nav link should
	// dismiss the menu immediately while the chosen page loads underneath,
	// not leave the overlay sitting open over it.
	const [mobileNavOpen, setMobileNavOpen] = useState(false);
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

	// Only ever fetched for an Admin — a Super Admin already sees every
	// reserved module normally, and no other role can reach them under any
	// circumstance, so there's nothing for this to unlock for them. See
	// GET /api/bootstrap-status and requireSuperAdmin() in
	// lib/require-role.ts for the matching server-side fallback this
	// mirrors.
	const { data: bootstrapStatus } = useQuery<{ superAdminExists: boolean }>({
		queryKey: ["bootstrap-status"],
		queryFn: () => fetchData<{ superAdminExists: boolean }>("/api/bootstrap-status"),
		enabled: users?.role === "Admin",
		staleTime: 30_000,
	});
	const superAdminBootstrapping =
		users?.role === "Admin" && bootstrapStatus?.superAdminExists === false;

	useEffect(() => {
		if (data) {
			setUsers(data);
		}
	}, [data, setUsers]);

	// Frontend nav filtering — the real security boundary is the API layer
	// (requireRole on each route), this only controls what's shown/reachable
	// in the UI. Middleware has already confirmed the account is active and
	// has a role before this component ever renders. A group is filtered by
	// its CHILDREN individually (so a role that can only reach one of the
	// two Report sub-pages still sees Report with just that one link) and
	// dropped entirely once it has none left.
	const navItems = useMemo<NavEntry[]>(
		() =>
			ALL_NAV_ITEMS.flatMap((entry): NavEntry[] => {
				if (entry.type === "leaf") {
					return canAccessModule(users?.role, entry.key, { superAdminBootstrapping })
						? [entry]
						: [];
				}
				const children = entry.children.filter((c) =>
					canAccessModule(users?.role, c.key, { superAdminBootstrapping })
				);
				return children.length > 0 ? [{ ...entry, children }] : [];
			}),
		[users?.role, superAdminBootstrapping]
	);

	// Which groups are expanded in the sidebar. Absent from this map means
	// "not explicitly toggled yet" — NavEntries falls back to auto-expanding
	// a group that contains the currently active page, so landing on
	// Monitoring (e.g. via a role change or a future deep link) doesn't show
	// Report collapsed with its own active child hidden inside it.
	const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
	const setGroupExpanded = (groupKey: string, next: boolean) =>
		setExpandedGroups((prev) => ({ ...prev, [groupKey]: next }));

	const isTechnician = users?.role === "Technician";

	// If the user's current tab is no longer permitted (e.g. role changed
	// mid-session), fall back to Dashboard rather than showing a blocked page.
	useEffect(() => {
		if (
			users?.role &&
			!canAccessModule(users.role, activePage, { superAdminBootstrapping })
		) {
			setActivePage("dashboard");
		}
	}, [users?.role, activePage, superAdminBootstrapping]);

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
		if (!canAccessModule(users?.role, activePage, { superAdminBootstrapping })) {
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
			case "reportMaintenance":
				return <ReportMaintenancePage />;
			case "reportMonitoring":
				return <MonitoringPage />;
			case "clients":
				return <ClientsPage />;
			case "schedule":
				return <SchedulePage />;
			case "pendingMaintenance":
				return <PendingMaintenancePage />;
			case "relatedIssues":
				return <RelatedIssuesPage />;
			case "timekeep":
				return <TimekeepPage />;
			case "staffGpsLocations":
				return <StaffGpsLocationsPage />;
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
		<nav className="flex-1 min-h-0">
			<ScrollArea className="h-full" viewportClassName="space-y-1 px-3">
				<NavEntries
					entries={navItems}
					activePage={activePage}
					setActivePage={setActivePage}
					collapsed={collapsed}
					expandedGroups={expandedGroups}
					onToggleGroup={setGroupExpanded}
				/>
			</ScrollArea>
		</nav>
	);

	// Technicians are mobile-only now. Placed here, AFTER every hook above,
	// so the early return can never change the hook call order between
	// renders (the role arrives asynchronously via useDBUser, so this
	// component renders at least once before `users?.role` is known).
	//
	// Nothing Technician-specific has been deleted: the Maintenance page,
	// AttendanceGate, GpsReporter and every /api route that accepts the
	// Technician role are all still here and still working, because the
	// Fiix Technician mobile app calls that same API. This closes the web
	// shell only.
	if (isWebBlockedRole(users?.role)) {
		return <TechnicianWebNotice firstName={users?.firstName} />;
	}

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
						<Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
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
									expandedGroups={expandedGroups}
									onToggleGroup={setGroupExpanded}
									onNavigate={() => setMobileNavOpen(false)}
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

/**
 * Renders one level of sidebar nav — shared between the desktop `NavList`
 * and the mobile `SheetNav`, so a leaf and a group only have one rendering
 * implementation each rather than two copies that could drift apart.
 *
 * A `NavGroup` (currently just Report) renders as a toggle button; clicking
 * it reveals its children indented underneath, rather than navigating
 * anywhere itself — there's no page behind "Report" alone, only behind its
 * Maintenance/Monitoring children. In the desktop sidebar's collapsed
 * (icon-only) mode there's no room to show indented children at all, so the
 * group button instead jumps straight to its first child.
 */
function NavEntries({
	entries,
	activePage,
	setActivePage,
	collapsed = false,
	expandedGroups,
	onToggleGroup,
	onNavigate,
}: {
	entries: NavEntry[];
	activePage: PageKey;
	setActivePage: (p: PageKey) => void;
	/** Icon-only desktop sidebar mode. Always false for the mobile Sheet,
	 * which is never collapsed. */
	collapsed?: boolean;
	expandedGroups: Record<string, boolean>;
	onToggleGroup: (groupKey: string, next: boolean) => void;
	/** Called right after a LEAF is selected (never for a group toggle,
	 * which doesn't navigate) — closes the mobile Sheet so the menu
	 * dismisses immediately while the chosen page loads underneath, instead
	 * of leaving the overlay open until the user dismisses it separately.
	 * Omitted on desktop, where there's no sheet to close. */
	onNavigate?: () => void;
}) {
	return (
		<>
			{entries.map((entry) => {
				if (entry.type === "leaf") {
					const active = activePage === entry.key;
					return (
						<button
							key={entry.key}
							onClick={() => {
								setActivePage(entry.key);
								onNavigate?.();
							}}
							title={collapsed ? entry.label : undefined}
							className={cn(
								"flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
								"text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
								active &&
									"bg-white text-primary shadow-sm hover:bg-white hover:text-primary"
							)}
						>
							<entry.icon className="h-5 w-5 shrink-0" />
							{!collapsed && <span>{entry.label}</span>}
						</button>
					);
				}

				// Group (Report ▸ Maintenance / Monitoring, today — see
				// ALL_NAV_ITEMS). Auto-expands when one of its children is the
				// active page and hasn't been explicitly toggled otherwise, so
				// navigating here some other way (a role change, a future deep
				// link) never leaves the active page hidden inside a collapsed
				// group.
				const childActive = entry.children.some((c) => c.key === activePage);
				const expanded = collapsed ? false : expandedGroups[entry.groupKey] ?? childActive;

				return (
					<div key={entry.groupKey}>
						<button
							onClick={() => {
								if (collapsed) {
									setActivePage(entry.children[0].key);
									onNavigate?.();
								} else {
									onToggleGroup(entry.groupKey, !expanded);
								}
							}}
							title={collapsed ? entry.label : undefined}
							aria-expanded={collapsed ? undefined : expanded}
							className={cn(
								"flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
								"text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
								collapsed &&
									childActive &&
									"bg-white text-primary shadow-sm hover:bg-white hover:text-primary"
							)}
						>
							<entry.icon className="h-5 w-5 shrink-0" />
							{!collapsed && (
								<>
									<span className="flex-1 text-left">{entry.label}</span>
									<ChevronDown
										className={cn(
											"h-4 w-4 shrink-0 transition-transform",
											expanded && "rotate-180"
										)}
									/>
								</>
							)}
						</button>
						{!collapsed && expanded && (
							<div className="mt-1 ml-4 space-y-1 border-l border-sidebar-border pl-3">
								{entry.children.map((child) => {
									const active = activePage === child.key;
									return (
										<button
											key={child.key}
											onClick={() => {
												setActivePage(child.key);
												onNavigate?.();
											}}
											className={cn(
												"flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors",
												"text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
												active &&
													"bg-white text-primary shadow-sm hover:bg-white hover:text-primary"
											)}
										>
											<span>{child.label}</span>
										</button>
									);
								})}
							</div>
						)}
					</div>
				);
			})}
		</>
	);
}

function SheetNav({
	navItems,
	activePage,
	setActivePage,
	expandedGroups,
	onToggleGroup,
	onNavigate,
}: {
	navItems: NavEntry[];
	activePage: PageKey;
	setActivePage: (p: PageKey) => void;
	expandedGroups: Record<string, boolean>;
	onToggleGroup: (groupKey: string, next: boolean) => void;
	/** Called right after a nav link is selected — closes the mobile Sheet
	 * so the menu dismisses immediately while the chosen page loads
	 * underneath, instead of leaving the overlay open until the user
	 * dismisses it separately. Applied to every link here (page nav items
	 * and Profile), same behavior across the board. */
	onNavigate: () => void;
}) {
	return (
		<nav className="flex-1 min-h-0">
			<ScrollArea className="h-full" viewportClassName="space-y-1 px-3">
			<NavEntries
				entries={navItems}
				activePage={activePage}
				setActivePage={setActivePage}
				expandedGroups={expandedGroups}
				onToggleGroup={onToggleGroup}
				onNavigate={onNavigate}
			/>
			<Link
				href="/profile"
				onClick={onNavigate}
				className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent"
			>
				<CircleUserRound className="h-5 w-5 shrink-0" />
				<span>Profile</span>
			</Link>
			<div className="pt-1">
				<SignOutBtn />
			</div>
			</ScrollArea>
		</nav>
	);
}
