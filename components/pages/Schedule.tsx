//Schedule.tsx
import React, { useEffect } from "react"; // Keep React imported
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ComboBoxResponsive, ComboboxItem } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { fetchData } from "@/lib/fetchData";
import { useState, useMemo } from "react";
import { format } from "date-fns";
import {
	PrinterEdit,
	Printer,
	diffPrinters,
} from "@/components/columns/printers/columns";
import {
	getScheduleColumns,
	Schedule,
} from "@/components/columns/schedules/columns";
import { showAppToast } from "../ui/apptoast";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
	SheetFooter,
} from "@/components/ui/sheet";
import {
	ColumnDef,
	ColumnFiltersState,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	SortingState,
	useReactTable,
	VisibilityState,
	RowSelectionState,
} from "@tanstack/react-table";
import { Skeleton } from "@/components/ui/skeleton";
import {
	useQuery,
	useQueries,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogFooter,
	DialogTrigger,
} from "@/components/ui/dialog";
import { PrinterComponents } from "@/components/PrinterComponents"; // Adjust path
import { MaintenanceOpenIssues } from "@/types/index";
import { OpenIssueComponent } from "../OpenIssueComponents";
import { LoadingSpinnerModal } from "../ui/loading-modal";
import { PrinterStatusCard } from "../PrinterStatusCard";
import PendingMaintenancePanel from "./PendingMaintenancePanel";
import { UnmaintainedPrintersPanel } from "@/components/UnmaintainedPrintersPanel";
import { ScheduleCard } from "../ScheduleCard";
import { ListOrdered, Lock } from "lucide-react";
import { NEEDS_ATTENTION_STATUS_LIST } from "@/lib/maintenance-status";
import { apiPath } from "@/lib/base-path";
import {
	hasCoordinates,
	openGoogleMapsDirections,
	type LatLng,
} from "@/lib/maps";
import { phTodayDateString } from "@/lib/attendance";

export type Maintenance = {
	id: number;
	serialNo: string;
	department: string;
	status:
		| "Good Condition"
		| "Replacement (Unit)"
		| "Replacement (Parts)"
		| "Pulled Out";
	technician: string;
	date: string;
};

interface Client {
	id: string;
	name: string;
}

interface Location {
	id: string;
	clientId: string; // Foreign key linking to Client
	name: string;
}

export interface Technician {
	id: string;
	name: string;
}

export interface Priority {
	id: string;
	name: string;
}

// Define the type for the payload you'll send to the API
interface ScheduleMaintenancePayload {
	technicianId: string;
	clientId: string;
	locationId: string;
	priority: string;
	notes?: string;
	maintainAll: boolean;
	scheduleDate: Date | undefined;
	scheduleId: number;
	added: {
		printerId: number; // Ang ID ng printer (base sa error na 'number')
		mtId: number; // Ang MT ID ng printer (base sa error na 'number')
	}[];
	removed: {
		printerId: number;
		mtId: number;
	}[];
	// "Add Schedule" | "Update Schedule" | "Reschedule". "Reschedule" is
	// handled server-side as a create that skips the duplicate-schedule
	// guard and links back to the original — see app/api/schedule/route.ts.
	actions: string;
}

// Define the type for the response you expect from the API (optional, but good practice)
interface ScheduleMaintenanceResponse {
	message: string;
	// Add other fields you might get back, e.g., scheduledMaintenanceId
}

// Mutation function to send the schedule data to the API
const createMaintenanceSchedule = async (
	payload: ScheduleMaintenancePayload
): Promise<ScheduleMaintenanceResponse> => {
	const response = await fetch(apiPath("/api/schedule"), {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		const errorData = await response.json();
		throw new Error(errorData.message || "Failed to create schedule.");
	}

	return response.json();
};

/** Stable empty-array reference — see the note at its use site. */
const EMPTY_SCHEDULES: Schedule[] = [];

/** One row of /api/location-coordinates — the geofence pin for a client
 * location. Only ever used to build a Maps link; deliberately never
 * rendered, since raw latitude/longitude is noise to a Scheduler. */
interface LocationCoordinate extends LatLng {
	locationId: number;
}
// Same stable-reference reasoning as EMPTY_SCHEDULES above, for the
// coordinates query.
const EMPTY_COORDINATES: LocationCoordinate[] = [];

export default function SchedulePage() {
	const [edits, setEdits] = useState<Record<string, PrinterEdit>>({});

	// State for selected Client ID
	const [selectedTechnicianId, setSelectedTechnicianId] = useState<
		string | null
	>("0");

	const [selectedClientId, setSelectedClientId] = useState<string | null>("0");

	// State for selected Location ID
	const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
		"0"
	);

	const [selectedPriorityId, setSelectedPriorityId] = useState<string | null>(
		null
	);

	const [notes, setNotes] = useState<string | null>(null);

	const [scheduleDate, setScheduleDate] = useState<Date | undefined>(undefined);

	const [tempTechnicianId, setTempTechnicianId] = useState<string | null>(null);

	const [tempScheduleDate, setTempScheduleDate] = useState<Date | undefined>(
		undefined
	);

	const [scheduleId, setScheduleId] = useState(0);

	const [isScheduleDetailsDialogOpen, setIsScheduleDetailsDialogOpen] =
		useState(false);
	// State to control if the combined modal is open
	const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);

	const [isEditing, setIsEditing] = useState(false);
	const [isAdding, setIsAdding] = useState(false);
	const [isShowDetails, setIsShowDetails] = useState(false);
	// True while handleCardClick's printer-details fetch for the clicked
	// schedule is in flight. Distinct from overallLoading (which only covers
	// the reference lists — clients/locations/technicians/priorities/open
	// issues) — this covers the per-schedule fetch that only happens after a
	// card is clicked, so the Save/Open Issues buttons stay disabled through
	// that window too, not just the initial page load.
	const [isLoadingScheduleDetails, setIsLoadingScheduleDetails] =
		useState(false);
	const [immediatePrinters, setImmediatePrinters] = useState<
		Printer[] | undefined
	>(undefined);
	const [action, setAction] = useState("");

	// selectedTechnicianId !== null && scheduleDate !== undefined;

	// NEW STATES for Printer Details Dialog
	const [printerDetailSerialNo, setPrinterDetailSerialNo] = useState<
		string | null
	>(null);
	const [isPrinterDetailsDialogOpen, setIsPrinterDetailsDialogOpen] =
		useState(false);

	const [currentDate, setCurrentDate] = useState<string>("");

	// Get query client for invalidation
	const queryClient = useQueryClient();

	// Setup the useMutation hook
	const {
		mutate, // The function to call to trigger the mutation
		isPending: isLoadingMaintenanceMutation, // True while the mutation is in progress
		// isSuccess: isSavingSuccess, // True if the mutation was successful
		// isError: isMutationError, // True if the mutation failed
		// error: mutationError, // The error object if the mutation failed
		// reset, // Function to reset the mutation state
	} = useMutation({
		mutationFn: createMaintenanceSchedule, // The function that performs the API call
		onSuccess: () => {
			showAppToast({
				// Using the ternary operator for the conditional message
				message:
					action === "FromDataGrid"
						? "Schedule successfully created!"
						: "Schedule has been rescheduled successfully",

				// You can also adjust the description based on the action if needed
				description:
					action === "FromDataGrid"
						? "A new schedule has been added to the system."
						: "A new schedule was created for the outstanding printers. The original schedule is kept on record as missed.",
				position: "top-right",
				color: "success",
			});
			// Invalidate queries that might be affected by the new schedule
			// For example, if adding a schedule should update the list of printers or future schedules:
			queryClient.invalidateQueries({ queryKey: ["printers"] }); // Refetch printer data
			queryClient.invalidateQueries({ queryKey: ["schedules"] }); // If you have a separate schedule list

			// setScheduleDate(undefined); // Clear date picker
			// setSelectedTechnicianId(null); // Clear technician
			// // // Reset client/location if desired after submission
			// setSelectedClientId("0");
			// setSelectedLocationId("0");
			// setEdits({});
			// setNotes("");
			// setIsShowDetails(false);
		},
		onError: (error) => {
			showAppToast({
				message: `Failed to create schedule: ${error.message}`,
				description: "Error",
				position: "top-right",
				color: "error",
			});
		},
		// Optional: onSettled runs regardless of success or error
		// onSettled: () => {
		//   // You might reset the mutation state here if you want to allow immediate re-submission
		//   // without waiting for the next action.
		//   // reset();
		// },
	});

	// Use useQueries to fetch all data concurrently
	const results = useQueries({
		queries: [
			{
				queryKey: ["clients"],
				queryFn: () => fetchData<Client[]>("/api/clients"), // Removed | undefined as useQuery handles undefined data before fetch
				refetchOnWindowFocus: false,
				staleTime: 1000 * 60 * 5,
			},
			{
				queryKey: ["locations"],
				queryFn: () => fetchData<Location[]>("/api/locations"), // Removed | undefined
				refetchOnWindowFocus: false,
				staleTime: 1000 * 60 * 5,
			},
			{
				queryKey: ["technicians"],
				queryFn: () => fetchData<Technician[]>("/api/technicians"), // Removed | undefined
				refetchOnWindowFocus: false,
				staleTime: 1000 * 60 * 5,
			},
			{
				queryKey: ["priorities"],
				queryFn: () => fetchData<Priority[]>("/api/priorities"), // Removed | undefined
				refetchOnWindowFocus: false,
				staleTime: 1000 * 60 * 5,
			},
			{
				queryKey: ["openIssues"],
				queryFn: () => fetchData<MaintenanceOpenIssues[]>("/api/open-issues"), // Removed | undefined
				refetchOnWindowFocus: false,
				staleTime: 1000 * 60 * 5,
			},
		],
	});

	// Destructure the results for easier access and clarity
	const [
		{ data: allClients, isLoading: isLoadingClients, isError: isErrorClients },
		{
			data: allLocations,
			isLoading: isLoadingAllLocations,
			isError: isErrorAllLocations,
		},
		{
			data: allTechnicians,
			isLoading: isLoadingTechnicians,
			isError: isErrorTechnicians,
		},
		{
			data: allPriorities,
			isLoading: isLoadingPriorities,
			isError: isErrorPriorities,
		},

		{
			data: allOpenIssues = [],
			isLoading: isLoadingOpenIssues,
			isError: isErrorOpenIssues,
		},
	] = results;

	// --- Dependent Data Fetching (Printer data based on selectedLocationId AND selectedClientId) ---
	const {
		data: printerData,
		// isPending: isLoadingPrinters,
		// isError: isErrorPrinters,
		// error: printersError,
	} = useQuery<Printer[], Error>({
		queryKey: ["printers", selectedClientId, selectedLocationId],
		queryFn: async () => {
			try {
				const res = await fetchData<Printer[]>(
					`/api/printers?clientId=${selectedClientId}&locationId=${selectedLocationId}`
				);

				return res;
			} catch (error) {
				console.error("Error fetching printers:", error);
				throw error; // let useQuery handle the error state
			}
		},

		enabled: !!selectedClientId && !!selectedLocationId, // Only run if both IDs are selected
		staleTime: 1000 * 60 * 1,
		placeholderData: (previousData) => previousData, // Keep this if you want to show previous data while refetching
		retry: false,
	});

	// --- Dependent Data Fetching (Printer data based on selectedLocationId AND selectedClientId) ---
	const {
		data: fetchedScheduleData,
		// isPending: isLoadingSchedules,
		// isError: isErrorSchedules,
		// error: schedulesError,
		isSuccess: isSchedulesSuccess,
		// True for the very first fetch of a technician/date pair AND for
		// every later refetch of it (including a query-key change). Used
		// below to hold the card grid on a "Loading…" state instead of
		// `placeholderData`'s carried-over previous result — otherwise the
		// PREVIOUS technician/date's cards stay on screen for the whole
		// refetch, which reads as "picking a new technician & date didn't
		// populate anything" right up until the moment it flips.
		isFetching: isFetchingSchedules,
	} = useQuery<Schedule[], Error>({
		queryKey: ["schedules", selectedTechnicianId, scheduleDate],
		queryFn: () => {
			// This used to read `fetchedScheduleData` — its OWN result — to
			// decide which date to request, falling back to 1900-01-01 when
			// it was still undefined. That made the first fetch after a
			// technician/date change query a date nothing is ever scheduled
			// on, so the page could sit on an empty result for the day the
			// user actually picked. The picked date is right here in state;
			// use it, and let `enabled` below hold the query until there is
			// one.
			const scheduledAt = format(scheduleDate!, "yyyy-MM-dd");
			return fetchData<Schedule[]>(
				`/api/schedule?technicianId=${selectedTechnicianId}&scheduledAt=${scheduledAt}&pageSource=Schedule`
			);
		},
		// Gated on what this query actually needs. It was previously gated on
		// client/location, which this request doesn't use at all — and which
		// the Change Technician & Date flow resets to "0", so the gate said
		// nothing useful either way.
		enabled:
			!!selectedTechnicianId && selectedTechnicianId !== "0" && !!scheduleDate,
		staleTime: 1000 * 60 * 1,
		// previousData is still used as a base so the grid doesn't flash
		// empty between technician/date changes, but the render below never
		// shows it directly while isFetchingSchedules is true — see the
		// comment on isFetching above.
		placeholderData: (previousData) => previousData,
		retry: false,
	});

	// Determines Save vs Update automatically: is there already a schedule
	// for this client + location + date, regardless of which technician is
	// currently selected in the form? Drives the button label/action instead
	// of the previous manual isEditing toggle, and also prevents creating a
	// second, conflicting schedule for a company/date that already has one.
	const { data: existingScheduleCheck } = useQuery<{
		exists: boolean;
		schedule?: {
			id: number;
			technicianId: number;
			priority: number;
			notes: string | null;
			maintainAll: boolean;
		};
	}>({
		queryKey: ["schedule-exists", selectedClientId, selectedLocationId, scheduleDate],
		queryFn: () =>
			fetchData(
				`/api/schedule/exists?clientId=${selectedClientId}&locationId=${selectedLocationId}&scheduledAt=${format(
					scheduleDate!,
					"yyyy-MM-dd"
				)}`
			),
		enabled: !!selectedClientId && !!selectedLocationId && !!scheduleDate,
		staleTime: 1000 * 30,
	});

	const existingSchedule = existingScheduleCheck?.exists
		? existingScheduleCheck.schedule
		: undefined;

	// When an existing schedule is found for the selected client/location/
	// date, switch into "editing that schedule" mode automatically and pull
	// in its printers, so the user lands on Update with the right data
	// already loaded instead of hitting a duplicate error on Save.
	useEffect(() => {
		if (!existingSchedule) {
			return;
		}

		setIsEditing(true);
		setScheduleId(existingSchedule.id);
		setSelectedTechnicianId(String(existingSchedule.technicianId));
		setSelectedPriorityId(String(existingSchedule.priority));
		setNotes(existingSchedule.notes || "");
		setIsShowDetails(true);

		const fullQueryKey = [
			"printers",
			selectedClientId,
			selectedLocationId,
			existingSchedule.id,
		];

		queryClient
			.fetchQuery<Printer[], Error>({
				queryKey: fullQueryKey,
				queryFn: () =>
					fetchData<Printer[]>(
						`/api/printers?clientId=${selectedClientId}&locationId=${selectedLocationId}&scheduleId=${existingSchedule.id}`
					),
				staleTime: 1000 * 60,
			})
			.then((printers) => setImmediatePrinters(printers ?? []))
			.catch(() => setImmediatePrinters([]));
	}, [existingSchedule, selectedClientId, selectedLocationId, queryClient]);

	// No existing schedule for this combo — make sure we're in fresh
	// "create" mode rather than left over in edit mode from a previous
	// selection.
	useEffect(() => {
		if (existingScheduleCheck && !existingScheduleCheck.exists) {
			setIsEditing(false);
			setScheduleId(0);
		}
	}, [existingScheduleCheck]);

	// Combined Loading and Error states
	const overallLoading =
		isLoadingClients ||
		isLoadingAllLocations ||
		isLoadingTechnicians ||
		isLoadingPriorities ||
		isLoadingOpenIssues;

	const overallError =
		isErrorClients ||
		isErrorAllLocations ||
		isErrorTechnicians ||
		isErrorPriorities ||
		isErrorOpenIssues;

	// Single source of truth for "needs a technician" — see
	// lib/maintenance-status.ts. This used to be its own hardcoded copy
	// (the exact kind of duplication that lib file's own comment says it
	// was written to prevent, just never actually wired up here), which
	// meant adding a status there alone wouldn't have been enough — this
	// client-side filter would have silently dropped it right back out.
	const TARGET_STATUSES: ReadonlySet<string> = useMemo(
		() => new Set(NEEDS_ATTENTION_STATUS_LIST),
		[]
	);

	// --- Data Transformation for ComboBoxResponsive (using useMemo for stability) ---

	const clientComboboxData: ComboboxItem[] = useMemo(() => {
		return (allClients ?? []).map((client) => ({
			value: String(client.id),
			label: client.name,
		}));
	}, [allClients]); // Only recompute if allClients array reference changes

	// --- Your filteredLocations calculation (keep useMemo for performance) ---
	const filteredLocations: Location[] = useMemo(() => {
		// Return empty if base data is not ready
		if (isLoadingAllLocations || !allLocations) {
			console.log("filteredLocations: allLocations not ready or loading.");
			return [];
		}

		// Filter only if a client is selected
		const locations = selectedClientId
			? allLocations.filter(
					(loc) => String(loc.clientId) === String(selectedClientId)
			  ) // Ensure type consistency for comparison
			: [];

		return locations;
	}, [selectedClientId, allLocations, isLoadingAllLocations]);

	const locationComboboxData: ComboboxItem[] = useMemo(() => {
		return filteredLocations.map((location) => ({
			value: String(location.id),
			label: location.name,
		}));
	}, [filteredLocations]); // Only recompute if filteredLocations changes

	const technicianComboboxData: ComboboxItem[] = useMemo(() => {
		return (allTechnicians ?? []).map((tech) => ({
			value: String(tech.id),
			label: tech.name,
		}));
	}, [allTechnicians]); // Only recompute if allTechnicians array reference changes

	const priorityComboboxData: ComboboxItem[] = useMemo(() => {
		return (allPriorities ?? []).map((priority) => ({
			value: String(priority.id),
			label: priority.name,
		}));
	}, [allPriorities]); // Only recompute if allTechnicians array reference changes

	// // --- State for tablePrinters ---
	// const [sortingPrinters, setSortingPrinters] = useState<SortingState>([]);
	// const [columnFiltersPrinters, setColumnFiltersPrinters] =
	// 	useState<ColumnFiltersState>([]);
	// const [globalFilterPrinters, setGlobalFilterPrinters] = useState<string>("");
	// const [columnVisibilityPrinters, setColumnVisibilityPrinters] =
	// 	useState<VisibilityState>({});
	// // const [rowSelectionPrinters, setRowSelectionPrinters] =
	// // 	useState<RowSelectionState>({});
	// const [paginationPrinters, setPaginationPrinters] = useState<PaginationState>(
	// 	{
	// 		pageIndex: 0,
	// 		pageSize: 5,
	// 	}
	// );

	// --- State for tableSchedules ---
	const [sortingSchedules, setSortingSchedules] = useState<SortingState>([]);
	const [columnFiltersSchedules, setColumnFiltersSchedules] =
		useState<ColumnFiltersState>([]);
	const [globalFilterSchedules, setGlobalFilterSchedules] =
		useState<string>("");
	const [columnVisibilitySchedules, setColumnVisibilitySchedules] =
		useState<VisibilityState>({});
	const [rowSelectionSchedules, setRowSelectionSchedules] =
		useState<RowSelectionState>({});
	// Module-level constant, not a fresh `[]` literal: this value is a
	// dependency of the effect below, and a new array reference on every
	// render would re-fire it every render (the same trap that once caused
	// a "Maximum update depth exceeded" loop in ItinerarySequenceManager).
	const scheduleData = fetchedScheduleData ?? EMPTY_SCHEDULES;

	// --- First-stop lock (mirrors PATCH /api/schedule/sequence's own rule) -
	// Only meaningful for TODAY — reordering a past or future day is never
	// restricted by whether the technician has timed in (they can't have,
	// for a future day; it's moot for a past one).
	const scheduledAtStr = scheduleDate ? format(scheduleDate, "yyyy-MM-dd") : undefined;
	const scheduledAtIsToday = scheduledAtStr === phTodayDateString();
	const { data: technicianStatus } = useQuery<{ timedInToday: boolean }>({
		queryKey: ["technician-status", selectedTechnicianId],
		queryFn: () =>
			fetchData<{ timedInToday: boolean }>(
				`/api/attendance/technician-status?technicianId=${selectedTechnicianId}`
			),
		enabled:
			!!selectedTechnicianId &&
			selectedTechnicianId !== "0" &&
			scheduledAtIsToday,
		// Short — this drives a UI lock the Scheduler needs to see update
		// promptly right around when a technician actually times in.
		staleTime: 30 * 1000,
	});
	const firstStopLocked = scheduledAtIsToday && !!technicianStatus?.timedInToday;

	// --- Google Maps navigation ---------------------------------------------
	// Geofence pins for every configured location, fetched once and looked
	// up by locationId — same source lib/maps.ts and the Time In geofence
	// check both use, so a route drawn here always ends exactly where a
	// technician is required to be standing.
	const { data: locationCoordinates = EMPTY_COORDINATES } = useQuery<
		LocationCoordinate[]
	>({
		queryKey: ["location-coordinates"],
		queryFn: () => fetchData<LocationCoordinate[]>("/api/location-coordinates"),
		staleTime: 1000 * 60 * 10,
	});
	const coordsByLocationId = React.useMemo(() => {
		const map = new Map<number, LatLng>();
		for (const c of locationCoordinates) {
			if (hasCoordinates(c)) {
				map.set(c.locationId, { latitude: c.latitude, longitude: c.longitude });
			}
		}
		return map;
	}, [locationCoordinates]);

	// --- Itinerary drag-reorder -------------------------------------------
	// Local, reorderable copy of this technician/date's schedule ids.
	// `null` means "not yet initialized for the current scheduleData" —
	// distinct from an initialized-but-empty array — so the effect below
	// can tell "server data just changed, resync" apart from "the user
	// dragged the last card out", which should NOT be overwritten.
	const [itineraryOrder, setItineraryOrder] = React.useState<number[] | null>(
		null
	);
	const [draggedId, setDraggedId] = React.useState<number | null>(null);
	const [dragOverId, setDragOverId] = React.useState<number | null>(null);
	const [isSavingOrder, setIsSavingOrder] = React.useState(false);

	// Resyncs whenever the underlying schedules for this technician/date
	// change — a new technician/date picked, a save just landed, or a card
	// was added/removed/rescheduled — so a stale local order can never
	// drift from the server. Sorted the same sequence-first way the API
	// itself already orders by, so the FIRST render (before any drag)
	// exactly matches what's already on the server.
	React.useEffect(() => {
		setItineraryOrder(
			[...scheduleData]
				.sort((a, b) => {
					if (a.sequence != null && b.sequence != null) return a.sequence - b.sequence;
					if (a.sequence != null) return -1;
					if (b.sequence != null) return 1;
					return Number(a.id) - Number(b.id);
				})
				.map((s) => Number(s.id))
		);
	}, [scheduleData]);

	const scheduleById = React.useMemo(
		() => new Map(scheduleData.map((s) => [Number(s.id), s])),
		[scheduleData]
	);
	const orderedScheduleCards = (itineraryOrder ?? [])
		.map((id) => scheduleById.get(id))
		.filter((s): s is (typeof scheduleData)[number] => !!s);

	// Dirty relative to the server's own sequence-first order (the same
	// derivation used to seed itineraryOrder above), not relative to
	// insertion order — so a technician/date that was already reordered on
	// a previous visit doesn't show Save Order as enabled the instant it
	// loads.
	const serverOrderIds = [...scheduleData]
		.sort((a, b) => {
			if (a.sequence != null && b.sequence != null) return a.sequence - b.sequence;
			if (a.sequence != null) return -1;
			if (b.sequence != null) return 1;
			return Number(a.id) - Number(b.id);
		})
		.map((s) => Number(s.id));
	const isItineraryOrderDirty =
		!!itineraryOrder &&
		(itineraryOrder.length !== serverOrderIds.length ||
			itineraryOrder.some((id, i) => id !== serverOrderIds[i]));

	const handleCardDragStart =
		(id: number) => (e: React.DragEvent<HTMLDivElement>) => {
			setDraggedId(id);
			e.dataTransfer.effectAllowed = "move";
		};
	const handleCardDragOver =
		(id: number) => (e: React.DragEvent<HTMLDivElement>) => {
			e.preventDefault();
			if (draggedId != null && draggedId !== id) setDragOverId(id);
		};
	const handleCardDragLeave = (id: number) => () => {
		setDragOverId((prev) => (prev === id ? null : prev));
	};
	// Order is determined by CARD PLACEMENT (top-to-bottom, then
	// left-to-right) — i.e. by array index in a row-major grid, which is
	// exactly what `itineraryOrder`'s array order already represents.
	// Dropping simply moves the dragged id to the target's index.
	const handleCardDrop =
		(targetId: number) => (e: React.DragEvent<HTMLDivElement>) => {
			e.preventDefault();
			setDragOverId(null);
			const sourceId = draggedId;
			setDraggedId(null);
			if (sourceId == null || sourceId === targetId) return;
			setItineraryOrder((prev) => {
				if (!prev) return prev;
				const next = [...prev];
				const from = next.indexOf(sourceId);
				const to = next.indexOf(targetId);
				if (from === -1 || to === -1) return prev;
				next.splice(from, 1);
				next.splice(to, 0, sourceId);
				return next;
			});
		};
	const handleCardDragEnd = () => {
		setDraggedId(null);
		setDragOverId(null);
	};

	// Directions ending at this stop. For idx > 0, routes from the PREVIOUS
	// stop (the leg the technician is about to ride) — that's the same
	// "from previous stop" semantics the old ItinerarySequenceManager used.
	// For idx === 0 there is no preceding stop, so origin is omitted
	// entirely and Google Maps falls back to the device's current location
	// (see lib/maps.ts) rather than hiding the icon on the first card.
	const handleNavigateStop = (idx: number) => {
		const to = orderedScheduleCards[idx];
		if (!to) return;
		const destination = coordsByLocationId.get(to.locationId);
		if (!destination) return;

		if (idx === 0) {
			openGoogleMapsDirections(null, destination);
			return;
		}
		const from = orderedScheduleCards[idx - 1];
		const origin = from ? coordsByLocationId.get(from.locationId) : undefined;
		if (!origin) return;
		openGoogleMapsDirections(origin, destination);
	};

	const handleSaveOrder = async () => {
		if (
			!selectedTechnicianId ||
			selectedTechnicianId === "0" ||
			!scheduleDate ||
			!itineraryOrder ||
			itineraryOrder.length === 0
		) {
			return;
		}
		setIsSavingOrder(true);
		try {
			const res = await fetch(apiPath("/api/schedule/sequence"), {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					technicianId: Number(selectedTechnicianId),
					scheduledAt: format(scheduleDate, "yyyy-MM-dd"),
					orderedScheduleIds: itineraryOrder,
				}),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error || "Failed to save the new order.");
			}
			showAppToast({
				message: "Itinerary order saved",
				position: "top-right",
				color: "success",
			});
			queryClient.invalidateQueries({ queryKey: ["schedules"] });
		} catch (err) {
			showAppToast({
				message: "Save failed",
				description: err instanceof Error ? err.message : "Please try again.",
				position: "top-right",
				color: "error",
			});
		} finally {
			setIsSavingOrder(false);
		}
	};

	React.useEffect(() => {
		async function fetchTime() {
			const res = await fetch(apiPath("/api/ph-time"));
			const data = await res.json();
			setCurrentDate(data.time);
		}
		fetchTime();
	}, []);

	React.useEffect(() => {
		// Also holds off while isFetchingSchedules is true — otherwise
		// `scheduleData` can still be the PREVIOUS technician/date's
		// (possibly empty) placeholder result, and this would fire "No
		// schedules found" for a selection that, once the fetch actually
		// lands, does have one.
		if (
			isSchedulesSuccess &&
			!isFetchingSchedules &&
			scheduleData.length === 0 &&
			!isSetupModalOpen
		) {
			console.log(
				"No schedules found for the selected technician and date. Please select a different technician or date."
			);
			showAppToast({
				message: "No schedules found for the selected technician and date.",
				description: "Information",
				position: "top-right",
				color: "info",
			});
		}
	}, [scheduleData, isSchedulesSuccess, isFetchingSchedules, isSetupModalOpen]); // Re-run when scheduleData changes

	// The Client / Location / Priority / Notes controls are unlocked purely by
	// this: a technician and date have been confirmed, so the user is in
	// create or edit mode. They used to ALSO require `scheduleData.length > 0`
	// — i.e. "you may only fill in this form if this technician already has
	// schedules on this date" — which is backwards, since filling it in is how
	// the first schedule for that day gets created. It also disabled the whole
	// form any time the schedules query had no data yet (initial fetch, a
	// refetch with no cached result, an errored request), which is the freeze
	// that showed up right after Change Technician & Date.
	const areControlsEnabled = isEditing || isAdding;

	const handleEditSchedule = React.useCallback(
		(schedId: number) => {
			// alert("Edit: " + schedId);
			const schedules = tableSchedules.options.data as Schedule[];
			if (!Array.isArray(schedules)) {
				// Or if fetchedSchedules is undefined, null, or not an array
				console.warn(
					"fetchedSchedules is not an array or is undefined.",
					scheduleData
				);
				// Optionally show a toast/alert that data is not ready
				// showAppToast("Schedule data is not loaded yet.", "info");
				return;
			}
			// console.log("Editing Schedule ID:", schedId);
			// console.log("Editing Schedule Data:", schedules);
			const scheduleToEdit = schedules?.find(
				(schedule) => String(schedule.id) === String(schedId)
			);

			if (scheduleToEdit) {
				setIsEditing(true);
				setScheduleId(schedId);
				setSelectedClientId(String(scheduleToEdit.clientId));
				setSelectedPriorityId(String(scheduleToEdit.priorityId)); // Load the entire priority object
				setNotes(scheduleToEdit.notes || ""); // Ensure notes is a string, default to empty
			} else {
				// Handle the case where the schedule with schedId is not found
				showAppToast({
					message: "Schedule not found for editing.",
					description: "error",
					position: "top-right",
					color: "error", // This will influence the default icon color and potential border
				});
				// alert("Error: Schedule not found for editing.");
			}
		},
		[setPrinterDetailSerialNo, setIsPrinterDetailsDialogOpen]
	);

	// 3. Filter the data using useMemo (map the allOpenIssues data)
	const allFilteredIOpenIssues: MaintenanceOpenIssues[] = React.useMemo(() => {
		return allOpenIssues!.filter((issue) => TARGET_STATUSES.has(issue.status));
	}, [allOpenIssues]);

	// --- Refined useEffect for Location ID synchronization ---
	useEffect(() => {
		if (
			isEditing &&
			selectedClientId &&
			scheduleId &&
			filteredLocations.length > 0
		) {
			const schedules = tableSchedules.options.data as Schedule[];
			const scheduleToEdit = schedules.find(
				(s) => String(s.id) === String(scheduleId)
			);

			if (scheduleToEdit) {
				const originalClientId = String(scheduleToEdit.clientId);
				const originalLocationId = String(scheduleToEdit.locationId);

				// Ensure that the schedule's original client ID matches the currently selected client ID.
				// This is crucial to prevent setting a location for a different client.
				if (originalClientId === selectedClientId) {
					// Check if the original location ID exists within the currently filtered locations
					const locationExistsInFiltered = filteredLocations.some(
						(loc) => String(loc.id) === String(originalLocationId)
					);

					if (locationExistsInFiltered) {
						setSelectedLocationId(originalLocationId);
					} else {
						// Original location not found in the filtered list for this client
						// This can happen if:
						// 1. Data mismatch (location is truly invalid for client)
						// 2. Data is still loading or partially loaded for some reason
						console.warn(
							`Location Sync useEffect: Original location ID ${originalLocationId} not found for client ${selectedClientId}. Setting location to null.`
						);
						setSelectedLocationId(null); // Clear the location if not valid
					}
				} else {
					console.log(
						"Location Sync useEffect: Original schedule's client ID does not match current selectedClientId. Not setting location."
					);
					setSelectedLocationId(null); // Client mismatch, clear location
				}
			} else {
				console.warn(
					"Location Sync useEffect: ScheduleToEdit not found within useEffect context."
				);
			}
		} else if (isEditing && selectedClientId && !scheduleId) {
			// If we are editing, have a client, but no schedule ID (e.g., initial state of a new form before an actual edit target is selected)
			console.log(
				"Location Sync useEffect: Editing mode, client selected, but no scheduleId. Clearing location."
			);
			setSelectedLocationId(null); // Or set to a default for new schedule
		}
	}, [isEditing, selectedClientId, filteredLocations, scheduleId]); // Add tableSchedule as a dependency if schedules comes from there.

	// --- Handle manual client change (user changes client combobox) ---
	// This ensures that when the user changes the client, the location resets.
	useEffect(() => {
		// Only clear if not in the middle of an 'edit' operation *which sets both*
		if (!isEditing) {
			setSelectedLocationId("0");
		}
	}, [selectedClientId, isEditing]); // Triggers when selectedClientId changes (and not in edit mode)

	const handleDeleteSchedule = React.useCallback(
		async (schedId: number) => {
			// Prompt the user for confirmation before proceeding
			const confirmed = window.confirm(
				"Are you sure you want to delete this schedule? This action cannot be undone."
			);

			if (!confirmed) {
				// If the user cancels, do nothing
				return;
			}

			try {
				LoadingSpinnerModal({
					isOpen: true,
					message: "Deleting schedule...",
				});
				// Make the API call to delete the schedule

				await fetchData(`/api/schedule?scheduleId=${schedId}`, {
					method: "DELETE",
				});

				// Invalidate the query to refetch the schedule data
				await queryClient.invalidateQueries({ queryKey: ["schedules"] });

				// Show a success toast
				showAppToast({
					message: "Schedule deleted successfully.",
					description: "The schedule has been removed from the system.",
					position: "top-right",
					color: "success",
				});
			} catch (err) {
				// Check for the specific status code in the error object
				if (
					typeof err === "object" &&
					err !== null &&
					"status" in err &&
					err.status === 403
				) {
					showAppToast({
						message: "Deletion not allowed.",
						description:
							"Cannot delete a schedule with completed maintenance tasks.",
						position: "top-right",
						color: "error",
					});
				} else {
					showAppToast({
						message: "Failed to delete schedule.",
						description:
							"An error occurred while trying to delete the schedule. Please try again." +
							(err as Error).message,
						position: "top-right",
						color: "error",
					});
				}
			}
		},
		[queryClient]
	);

	const handleShowDetails = React.useCallback(
		async (schedId: number) => {
			console.log("Schedule Id: ", schedId);
			const schedules = tableSchedules.options.data as Schedule[];
			if (!Array.isArray(schedules)) {
				console.warn(
					"fetchedSchedules is not an array or is undefined.",
					scheduleData
				);
				return;
			}

			const scheduleToShow = schedules?.find(
				(schedule) => String(schedule.id) === String(schedId)
			);

			if (scheduleToShow) {
				setSelectedClientId(String(scheduleToShow.clientId));
				setSelectedLocationId(String(scheduleToShow.locationId));
				setScheduleDate(scheduleToShow.scheduleAt);
				setIsShowDetails(true);

				const fullQueryKey = [
					"printers",
					scheduleToShow.clientId,
					scheduleToShow.locationId,
					schedId,
				];

				try {
					// --- NEW: Invalidate the old query cache to force a fresh fetch ---
					await queryClient.invalidateQueries({
						queryKey: fullQueryKey,
					});

					const printers = await queryClient.fetchQuery<Printer[], Error>({
						queryKey: [
							"printers",
							scheduleToShow.clientId,
							scheduleToShow.locationId,
							schedId,
						],
						queryFn: () =>
							fetchData<Printer[]>(
								`/api/printers?clientId=${scheduleToShow.clientId}&locationId=${scheduleToShow.locationId}&scheduleId=${schedId}`
							),
						staleTime: 1000 * 60,
					});

					// console.log("Immediate Printers: ", printers.length);
					// Always set the state with the fetched printers, which could be an empty array.
					if (printers.length === 0) {
						setImmediatePrinters([]);
					} else {
						setImmediatePrinters(printers);
					}

					// Only show a toast if the array is empty. The rendering logic
					// in the JSX will handle showing "No printers found..."
					if (!printers || printers.length === 0) {
						showAppToast({
							message: "No Printers Found.",
							description:
								"No printers are assigned to the selected client and location. Please assign a printer to proceed.",
							position: "top-right",
							color: "error",
						});
					}
				} catch (err) {
					console.error("Failed to fetch printer data via queryClient:", err);

					// On a fetch error, set the printers to an empty array to
					// ensure the UI displays the "No printers found" message.
					setImmediatePrinters([]);

					showAppToast({
						message: "Error fetching printers.",
						description: "An error occurred while fetching printer data.",
						position: "top-right",
						color: "error",
					});
					return;
				}
			} else {
				// ... (your existing 'schedule not found' logic)
				setImmediatePrinters([]); // Clear printers if the schedule is not found.
				showAppToast({
					message: "The specified schedule is not available for viewing.",
					description: "Error: Schedule not found.",
					position: "top-right",
					color: "error",
				});
			}

			setScheduleId(schedId);
		},
		[
			setSelectedClientId,
			setSelectedLocationId,
			setScheduleDate,
			printerData,
			setImmediatePrinters,
		] // Add setImmediatePrinters to the dependency array
	);

	// Clicking a schedule card: populate the existing form fields and the
	// "Printer Details List" section below with this schedule's data, and
	// switch the submit button into "Update Schedule" mode. Written as one
	// self-contained handler rather than reusing handleShowDetails or
	// handleEditSchedule directly, since neither of those sets technicianId
	// (a required field for the update payload) — this fixes that gap too.
	const handleCardClick = React.useCallback(
		async (clickedSchedule: Schedule) => {
			const schedId = Number(clickedSchedule.id);

			setIsEditing(true);
			setScheduleId(schedId);
			setIsShowDetails(true);
			setSelectedClientId(String(clickedSchedule.clientId));
			setSelectedLocationId(String(clickedSchedule.locationId));
			setSelectedTechnicianId(String(clickedSchedule.technicianId));
			setSelectedPriorityId(String(clickedSchedule.priorityId));
			setNotes(clickedSchedule.notes || "");
			setScheduleDate(new Date(clickedSchedule.scheduleAt));
			setIsLoadingScheduleDetails(true);

			const fullQueryKey = [
				"printers",
				clickedSchedule.clientId,
				clickedSchedule.locationId,
				schedId,
			];

			try {
				await queryClient.invalidateQueries({ queryKey: fullQueryKey });

				const printers = await queryClient.fetchQuery<Printer[], Error>({
					queryKey: fullQueryKey,
					queryFn: () =>
						fetchData<Printer[]>(
							`/api/printers?clientId=${clickedSchedule.clientId}&locationId=${clickedSchedule.locationId}&scheduleId=${schedId}`
						),
					staleTime: 1000 * 60,
				});

				setImmediatePrinters(printers ?? []);

				if (!printers || printers.length === 0) {
					showAppToast({
						message: "No Printers Found.",
						description:
							"No printers are assigned to the selected client and location.",
						position: "top-right",
						color: "error",
					});
				}
			} catch (err) {
				console.error("Failed to fetch printer data:", err);
				setImmediatePrinters([]);
				showAppToast({
					message: "Error fetching printers.",
					description: "An error occurred while fetching printer data.",
					position: "top-right",
					color: "error",
				});
			} finally {
				setIsLoadingScheduleDetails(false);
			}
		},
		[queryClient]
	);

	const handleReschedule = React.useCallback(
		(schedId: number) => {
			setScheduleId(schedId);
			setIsSetupModalOpen(true);
			setAction("ClickFromGrid");
		},
		[setPrinterDetailSerialNo]
	);

	// IMPORTANT: Memoize the state object for useReactTable
	// const tablePrintersState = React.useMemo(
	// 	() => ({
	// 		sorting: sortingPrinters,
	// 		columnFilters: columnFiltersPrinters,
	// 		columnVisibility: columnVisibilityPrinters,
	// 		// rowSelection: rowSelectionPrinters,
	// 		globalFilter: globalFilterPrinters,
	// 		pagination: paginationPrinters,
	// 	}),
	// 	[
	// 		sortingPrinters,
	// 		columnFiltersPrinters,
	// 		columnVisibilityPrinters,
	// 		// rowSelectionPrinters,
	// 		globalFilterPrinters,
	// 		paginationPrinters,
	// 	]
	// );

	// IMPORTANT: Memoize the state object for useReactTable
	const tableSchedulesState = React.useMemo(
		() => ({
			sorting: sortingSchedules,
			columnFilters: columnFiltersSchedules,
			columnVisibility: columnVisibilitySchedules,
			rowSelection: rowSelectionSchedules,
			globalFilter: globalFilterSchedules,
		}),
		[
			sortingSchedules,
			columnFiltersSchedules,
			columnVisibilitySchedules,
			rowSelectionSchedules,
			globalFilterSchedules,
		]
	);

	// --- Memoize Schedule Columns ---
	// Pass the new handler to the columns
	const colsSchedule: ColumnDef<Schedule>[] = useMemo(
		() =>
			getScheduleColumns({
				onEditClick: handleEditSchedule, // Pass the new handler
				onDeleteClick: handleDeleteSchedule, // Pass the new handler
				onShowDetailsClick: handleShowDetails,
				onShowReschedClick: handleReschedule,
			}),
		[handleEditSchedule, handleDeleteSchedule, handleShowDetails] // Dependencies
	);

	const handleOpenChange = React.useCallback((isOpen: boolean): void => {
		// 1. Update the primary Dialog state - THIS IS CRUCIAL
		setIsSetupModalOpen(isOpen);

		if (isOpen) {
			setAction("ClickFromDialog");
		}
	}, []);

	const handlePrinterToggle = React.useCallback(
		(id: string, newIsToggled: boolean) => {
			setEdits((prev) => {
				const existing = prev[id] || {};
				// If the new value matches original, we can remove the edit entry to keep edits minimal
				const original = immediatePrinters?.find((p) => p.id === Number(id));
				if (original && original.isToggled === newIsToggled) {
					const { ...rest } = prev;
					return rest;
				}
				return {
					...prev,
					[id]: {
						...existing,
						isToggled: newIsToggled,
					},
				};
			});
		},
		[immediatePrinters]
	);

	const changedPrinters = useMemo(() => {
		if (!immediatePrinters) return [];

		return Object.entries(edits)
			.map(([id, edit]) => {
				const original = immediatePrinters.find((p) => p.id === Number(id));
				if (!original) return null;

				const merged = { ...original, ...edit };

				// ✅ Only include if toggled ON
				if (merged.isToggled === false) return null;

				return merged;
			})
			.filter(Boolean) as Printer[];
	}, [edits, immediatePrinters]);

	const tableSchedules = useReactTable({
		data: scheduleData,
		columns: colsSchedule,
		enableColumnPinning: true, // ✅ updated for v8
		onSortingChange: setSortingSchedules,
		onColumnFiltersChange: setColumnFiltersSchedules,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		onColumnVisibilityChange: setColumnVisibilitySchedules,
		onRowSelectionChange: setRowSelectionSchedules,
		state: tableSchedulesState,
		onGlobalFilterChange: setGlobalFilterSchedules,
	});

	React.useEffect(() => {
		tableSchedules.getColumn("actions")?.pin("right"); // or "right"
	}, [tableSchedules]);

	// Centralized loading and error handling for the entire page
	if (overallLoading) {
		return (
			// Skeleton display for the actual form structure
			<div className="p-4 space-y-6">
				{" "}
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
					{/* Technician, Date, Client, Location */}
					{[...Array(4)].map((_, i) => (
						<Skeleton key={i} className="h-10 w-full rounded-md" /> // Placeholder for selects/date pickers
					))}
				</div>
				{/* Open Issues Button */}
				<div className="flex justify-start">
					<Skeleton className="h-10 w-32 rounded-md" />
				</div>
				{/* Search and Columns */}
				<div className="flex items-center space-x-4">
					<Skeleton className="h-10 flex-grow rounded-md" />
					<Skeleton className="h-10 w-24 rounded-md" />
				</div>
				{/* Table Header and Body */}
				<div className="rounded-md border">
					{/* Table Header Skeleton */}
					<div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr] gap-4 p-4 border-b">
						<Skeleton className="h-4 w-4 rounded-sm" />
						{/* Checkbox placeholder */}
						<Skeleton className="h-4 w-20" />
						<Skeleton className="h-4 w-20" />
						<Skeleton className="h-4 w-24" />
						<Skeleton className="h-4 w-16" />
					</div>

					<div className="p-4 space-y-3">
						{[...Array(5)].map(
							(
								_,
								rowIndex // Simulate 5 rows
							) => (
								<div
									key={rowIndex}
									className="grid grid-cols-[auto_1fr_1fr_1fr_1fr] gap-4"
								>
									<Skeleton className="h-4 w-4 rounded-sm" />
									<Skeleton className="h-4 w-24" />
									<Skeleton className="h-4 w-20" />
									<Skeleton className="h-4 w-28" />
									<Skeleton className="h-4 w-20" />
								</div>
							)
						)}
					</div>

					<div className="flex items-center justify-center h-24">
						{/* This space will be empty during loading, mimicking the actual "No results." space */}
						{/* You could optionally add a smaller skeleton here if you wanted to simulate it loading */}
					</div>
				</div>
				{/* Pagination Skeletons */}
				<div className="flex items-center justify-between text-sm text-muted-foreground pt-4">
					<Skeleton className="h-4 w-48" />
					<Skeleton className="h-4 w-36" />
					<div className="space-x-2 flex">
						<Skeleton className="h-8 w-20 rounded-md" />
						<Skeleton className="h-8 w-16 rounded-md" />
					</div>
				</div>
			</div>
		);
	}

	if (overallError) {
		return (
			<div className="p-4 text-red-600">
				<h2 className="text-2xl font-bold mb-4">Schedule Data</h2>
				<p>Error: {"Failed to load data. Please try again later."}</p>
				{isErrorClients && <p>Client Data Error.</p>}
				{isErrorAllLocations && <p>Location Data Error.</p>}
				{isErrorTechnicians && <p>Technician Data Error.</p>}
				{/* {isErrorPrinters && <p>Printer Data Error: {printersError?.message}</p>} */}
			</div>
		);
	}

	const handleSchedule = async () => {
		// Previously derived from the clicked button's rendered text
		// (event.currentTarget.textContent), which broke the moment the
		// label needed to say "Save"/"Update" instead of "Add Schedule"/
		// "Update Schedule". Derive it explicitly from the same data that
		// decides the label instead.
		const buttonText = existingSchedule ? "Update Schedule" : "Add Schedule";

		if (
			!selectedTechnicianId ||
			selectedClientId == "0" ||
			selectedLocationId == "0" ||
			!scheduleDate ||
			selectedPriorityId === null
		) {
			showAppToast({
				message:
					"Please select all the necessary information. (Technician, Client, Location, and Date)",
				description: "Missing Information",
				position: "top-right",
				color: "warning", // This will influence the default icon color and potential border
			});

			return;
		}

		if (
			format(scheduleDate, "MM/dd/yyyy") <
			format(new Date(currentDate), "MM/dd/yyyy")
		) {
			showAppToast({
				message:
					"Updating or adding a record requires a schedule date that is not in the past.",
				description: "Older Dates Not Permitted.",
				position: "top-right",
				color: "warning", // This will influence the default icon color and potential border
			});

			return;
		}

		const filteredPrinters = immediatePrinters?.filter(
			(printer) =>
				printer.schedDetailsId !== null && printer.isMaintained === false
		);

		const { added, removed } = diffPrinters(
			filteredPrinters || [],
			changedPrinters || [],
			edits
		);

		// // Example: Sending data to a new API endpoint for scheduling
		const scheduleData = {
			technicianId: selectedTechnicianId || "0",
			clientId: selectedClientId || "0",
			locationId: selectedLocationId || "0",
			priority: selectedPriorityId || "0",
			notes: notes || "",
			maintainAll: true, //tablePrinters.getIsAllRowsSelected(),
			scheduleDate: scheduleDate,
			scheduleId: scheduleId,
			added,
			removed,
			actions: buttonText,
		};

		mutate(scheduleData);
	};

	// Function to handle confirmation in the modal
	const handleConfirmSelections = () => {
		// You can add validation here if needed before closing
		if (tempTechnicianId && tempScheduleDate) {
			if (action === "ClickFromGrid") {
				const selectedSchedule: Schedule | undefined =
					fetchedScheduleData!.find(
						(schedule) => String(schedule.id) === String(scheduleId)
					);

				console.log(
					selectedSchedule?.scheduleAt,
					format(tempScheduleDate, "MM/dd/yyyy")
				);
				// TypeScript safe way to check and use the selected schedule
				if (selectedSchedule) {
					if (
						selectedSchedule.scheduleAt.toString() ===
						format(tempScheduleDate, "MM/dd/yyyy")
					) {
						showAppToast({
							message: `Redeployment date cannot be the same as the original schedule date.`,
							description: "Validation",
							position: "top-right",
							color: "warning",
						});

						return;
					}

					const scheduleData = {
						technicianId: tempTechnicianId || "0",
						clientId: String(selectedSchedule.clientId) || "0",
						locationId: String(selectedSchedule.locationId) || "0",
						priority: String(selectedSchedule.priorityId) || "0",
						notes: selectedSchedule.notes || "",
						maintainAll: true, //tablePrinters.getIsAllRowsSelected(),
						scheduleDate: tempScheduleDate,
						scheduleId: scheduleId,
						added: [],
						removed: [],
						// NOT "Add Schedule". A missed visit is routinely
						// re-booked onto a day the technician already covers
						// that client/location, which the duplicate guard on
						// "Add Schedule" rejects. "Reschedule" tells the server
						// to skip that guard, carry the missed schedule's
						// still-unmaintained printers across, and record a link
						// back to the original — which itself stays untouched
						// and keeps reading as missed.
						actions: "Reschedule",
					};

					mutate(scheduleData);

					setIsEditing(false); // Enable editing mode
					setIsAdding(true); // Disable adding mode
					setSelectedTechnicianId(tempTechnicianId);
					setScheduleDate(tempScheduleDate);
					setSelectedClientId("0"); // Reset client selection
					setSelectedLocationId("0");
					setNotes(""); // Reset notes
					setIsSetupModalOpen(false); // Close the modal
					setIsShowDetails(false); // Reset show details state
				} else {
					showAppToast({
						message: `Schedule with ID ${scheduleId} not found.`,
						description: "Validation",
						position: "top-right",
						color: "warning",
					});
				}
			} else {
				// action === "ClickFromDialog"
				setIsEditing(false); // Enable editing mode
				setIsAdding(true); // Disable adding mode
				setSelectedTechnicianId(tempTechnicianId);
				setScheduleDate(tempScheduleDate);
				setSelectedClientId("0"); // Reset client selection
				setSelectedLocationId("0");
				setNotes(""); // Reset notes
				setIsSetupModalOpen(false); // Close the modal
				setIsShowDetails(false); // Reset show details state
			}
		} else {
			showAppToast({
				message: "Please select both a technician and a date.",
				description: "Validation",
				position: "top-right",
				color: "warning",
			});
		}
	};

	return (
		// Unmaintained Printers, Pending Maintenance, and the Schedule
		// workflow below all live in one shared scroll container instead of
		// each getting its own full-width browser scrollbar — a single slim
		// Radix ScrollArea for the whole page section.
		<ScrollArea className="h-[calc(100vh-140px)]" viewportClassName="pr-3">
		<div className="space-y-6">
			<UnmaintainedPrintersPanel />

			<PendingMaintenancePanel readOnly />

			<Card className="rounded-2xl border shadow-sm">
				<CardContent className="p-6 space-y-4">
					<div className="grid lg:grid-cols-3 grid-cols-1 gap-4">
						<div className="col-span-1 space-y-2">
							{/* ** Combined Technician & Date Selection Modal ** */}
							<Dialog open={isSetupModalOpen} onOpenChange={handleOpenChange}>
								<DialogTrigger asChild>
									{/* The button that opens the modal */}
									<Button className="mb-4">
										{areControlsEnabled
											? "Change Technician & Date"
											: "Select Technician & Date to Start"}
									</Button>
								</DialogTrigger>
								<DialogContent>
									<DialogHeader>
										<DialogTitle>
											Select Technician and Schedule Date
										</DialogTitle>
									</DialogHeader>

									<div className="grid gap-4 py-4">
										{/* Technician Selection */}
										<div className="space-y-2">
											<label htmlFor="technician-select">Technician:</label>
											<ComboBoxResponsive
												data={technicianComboboxData}
												placeholder="Technician"
												selectedValue={tempTechnicianId}
												onValueChange={setTempTechnicianId}
												emptyMessage="No technician found."
											/>
										</div>

										{/* Date Selection */}
										<div className="space-y-2">
											<label htmlFor="date-select">Schedule Date:</label>
											<DatePicker
												onDateSelect={setTempScheduleDate}
												selectedDate={tempScheduleDate}
											/>
										</div>
									</div>

									<DialogFooter>
										{/* Disable the confirm button until both are selected */}
										<Button
											onClick={handleConfirmSelections}
											disabled={
												tempTechnicianId === null ||
												tempScheduleDate === undefined
											}
										>
											{action === "ClickFromDialog"
												? "Confirm Selections"
												: "Reschedule"}
										</Button>
									</DialogFooter>
								</DialogContent>
							</Dialog>
							{/* Technician Combobox */}
							<ComboBoxResponsive
								data={technicianComboboxData}
								placeholder="Technician"
								selectedValue={selectedTechnicianId}
								onValueChange={setSelectedTechnicianId}
								emptyMessage="No technician found."
								disabled={true}
							/>
							<DatePicker
								onDateSelect={setScheduleDate}
								selectedDate={scheduleDate}
								disabled={true}
							/>
							<hr className="my-3" />
							{/* Client Combobox */}
							<ComboBoxResponsive
								key={selectedClientId} // Key to force re-render when selectedClientId changes
								data={clientComboboxData}
								placeholder="Client"
								selectedValue={selectedClientId}
								onValueChange={(id) => {
									setSelectedClientId(id);
									// setSelectedLocationId("0"); // Reset location when client changes
								}}
								emptyMessage={
									selectedClientId
										? isLoadingAllLocations
											? "Loading clients..."
											: "No client found.."
										: "Please select a client first."
								}
								disabled={!areControlsEnabled}
							/>
							{/* Location Combobox */}{" "}
							<ComboBoxResponsive
								data={locationComboboxData}
								placeholder={
									isLoadingAllLocations ? "Loading locations..." : "Location"
								}
								selectedValue={selectedLocationId}
								onValueChange={setSelectedLocationId}
								disabled={
									!selectedClientId ||
									isLoadingAllLocations ||
									!areControlsEnabled
								}
								emptyMessage={
									selectedClientId
										? isLoadingAllLocations
											? "Loading locations..."
											: "No locations found for this client."
										: "Please select a client first."
								}
							/>
							<ComboBoxResponsive
								data={priorityComboboxData}
								placeholder="Priority"
								selectedValue={selectedPriorityId}
								onValueChange={setSelectedPriorityId}
								emptyMessage="No priority found."
								disabled={!areControlsEnabled}
							/>
							<Textarea
								id="notes"
								placeholder="Leave a note here"
								value={notes || ""}
								onChange={(e) => setNotes(e.target.value)}
								disabled={!areControlsEnabled}
							/>
						</div>
						<div className="col-span-2">
							{/* Sheet component (unrelated to the primary issue, but kept for completeness) */}
							<Sheet>
								<SheetTrigger asChild>
									<Button
										variant="outline"
										disabled={isLoadingScheduleDetails || isLoadingOpenIssues}
									>
										Open Issues
									</Button>
								</SheetTrigger>
								<SheetContent className="w-[540px] md:w-[400px] flex flex-col">
									<SheetHeader>
										<SheetTitle>Current Open Issues</SheetTitle>
										<SheetDescription>
											These are unresolved printer issues that are actively
											being monitored or awaiting action.
										</SheetDescription>
									</SheetHeader>
									<ScrollArea className="min-h-0 flex-1" viewportClassName="px-4">
										{" "}
										{/* Added h-full here for parent to occupy full height */}
										<div className="grid gap-6">
											{" "}
											{/* Changed to flex-col and added overflow-y-auto */}
											{
												// 1. Ensure array exists and is not empty before attempting to sort
												allFilteredIOpenIssues &&
												allFilteredIOpenIssues?.length > 0 ? (
													// 2. Create a shallow copy of the array before sorting.
													// This is crucial in React to avoid side effects (mutating state/props directly).
													[...allFilteredIOpenIssues]
														// 3. Apply the sorting logic (Descending: latest createdAt first)
														.sort((a, b) => {
															// Convert the string to a Date object first, then get the timestamp
															const dateA = new Date(a.createdAt).getTime();
															const dateB = new Date(b.createdAt).getTime();

															// Descending sort (latest first): b - a
															return dateA - dateB;
														})
														// 4. Map over the sorted array
														.map((issue) => (
															<OpenIssueComponent key={issue.id} {...issue} />
														))
												) : (
													// Handle the case where the array is null, undefined, or empty
													<div>No open issues found.</div>
												)
											}
										</div>
									</ScrollArea>
									<SheetFooter>
										{/* <Button type="submit">Save changes</Button> */}
										{/* <SheetClose asChild>
											<Button variant="outline">Close</Button>
										</SheetClose> */}
									</SheetFooter>
								</SheetContent>
							</Sheet>

							<Button
								variant="outline"
								className="ml-2"
								onClick={handleSchedule}
								// Disabled until every piece of data this form depends on —
								// the reference lists (clients/locations/technicians/
								// priorities/open issues) AND, when a schedule card was
								// clicked, that schedule's own printer details — has
								// finished loading. Saving against partially-loaded data
								// was possible before this: the button had no disabled
								// logic active at all.
								disabled={overallLoading || isLoadingScheduleDetails}
							>
								{existingSchedule ? "Update" : "Save"}
							</Button>

							{/* Only meaningful once a technician + date's cards are on
							    screen to actually reorder — hidden rather than
							    disabled-and-confusing when there's nothing to save. */}
							{!!selectedTechnicianId &&
								selectedTechnicianId !== "0" &&
								orderedScheduleCards.length > 1 && (
									<Button
										variant="outline"
										className="ml-2 gap-2"
										onClick={handleSaveOrder}
										disabled={!isItineraryOrderDirty || isSavingOrder}
									>
										<ListOrdered className="h-4 w-4" />
										{isSavingOrder ? "Saving Order…" : "Save Order"}
									</Button>
								)}

							<Separator className="my-2" />

							{firstStopLocked && (
								<div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
									<Lock className="mt-0.5 h-4 w-4 shrink-0" />
									The technician has already timed in. Re-ordering the first
									itinerary is not allowed.
								</div>
							)}

							{isFetchingSchedules ? (
								// Deliberately not the previous technician/date's cards
								// (placeholderData) here — showing them while a new
								// selection is in flight is what made "Change
								// Technician & Date" look like it wasn't populating the
								// existing record: the OLD cards stayed put for the
								// whole fetch instead of the grid reflecting what was
								// just picked.
								<p className="py-6 text-center text-sm text-muted-foreground">
									Loading schedules for this technician and date…
								</p>
							) : scheduleData && scheduleData.length > 0 ? (
								<>
									{orderedScheduleCards.length > 1 && (
										<p className="pb-1 text-xs text-muted-foreground">
											Drag a card to reorder the itinerary — order runs
											top-to-bottom, then left-to-right.
										</p>
									)}
									<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
										{orderedScheduleCards.map((schedule, idx) => (
											<ScheduleCard
												key={schedule.id}
												schedule={schedule}
												onEditClick={handleEditSchedule}
												onDeleteClick={handleDeleteSchedule}
												onShowDetailsClick={handleShowDetails}
												onShowReschedClick={handleReschedule}
												onCardClick={handleCardClick}
												sequenceNumber={
													orderedScheduleCards.length > 1
														? idx + 1
														: undefined
												}
												draggableReorder={orderedScheduleCards.length > 1}
												isDragging={draggedId === Number(schedule.id)}
												isDropTarget={dragOverId === Number(schedule.id)}
												onDragStartCard={handleCardDragStart(
													Number(schedule.id)
												)}
												onDragOverCard={handleCardDragOver(
													Number(schedule.id)
												)}
												onDragLeaveCard={handleCardDragLeave(
													Number(schedule.id)
												)}
												onDropCard={handleCardDrop(Number(schedule.id))}
												onDragEndCard={handleCardDragEnd}
												isLocked={firstStopLocked && idx === 0}
												onNavigate={() => handleNavigateStop(idx)}
												navigateDisabled={
													!coordsByLocationId.has(schedule.locationId) ||
													(idx > 0 &&
														!coordsByLocationId.has(orderedScheduleCards[idx - 1]?.locationId ?? -1))
												}
												navigateTitle={
													idx === 0
														? 'Directions to this stop'
														: `Directions from ${orderedScheduleCards[idx - 1]?.location ?? 'previous stop'}`
												}
											/>
										))}
									</div>
								</>
							) : (
								<p className="py-6 text-center text-sm text-muted-foreground">
									No schedules yet for this selection.
								</p>
							)}
						</div>
					</div>

					<Separator className="my-2" />

					<div className="grid grid-cols-1 gap-4">
						<h1 className="text-xl font-bold mb-2 text-gray-800">
							Printer Details List
						</h1>
						<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
							{isShowDetails &&
								(immediatePrinters && immediatePrinters.length > 0 ? (
									immediatePrinters.map((printer) => (
										<PrinterStatusCard
											key={printer.id} // Use a unique key for each card
											{...printer} // Spread all properties as props to PrinterStatusCard
											onToggleChange={(next) =>
												handlePrinterToggle(String(printer.id), next)
											}
										/>
									))
								) : (
									<div>No printers found for this schedule.</div>
								))}
						</div>
						{/* Render PrinterComponents inside the dialog */}
						{printerDetailSerialNo && (
							<div className="w-full">
								<div className="flex items-center py-4 gap-2">
									{/* <Input
										placeholder="Filter all columns..."
										value={globalFilterPrinters ?? ""}
										onChange={(event) =>
											setGlobalFilterPrinters(event.target.value)
										}
										className="max-w-sm"
									/> */}
									{/* <Switch
										id="maintainAll"
										onCheckedChange={(checked) => console.log(checked)}
									/>
									<Label htmlFor="maintainAll">Maintain All</Label> */}
									{/* <DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button variant="outline" className="ml-auto">
												Columns <ChevronDown />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											{tablePrinters
												.getAllColumns()
												.filter((column) => column.getCanHide())
												.map((column) => {
													return (
														<DropdownMenuCheckboxItem
															key={column.id}
															className="capitalize"
															checked={column.getIsVisible()}
															onCheckedChange={(value) =>
																column.toggleVisibility(!!value)
															}
														>
															{column.id}
														</DropdownMenuCheckboxItem>
													);
												})}
										</DropdownMenuContent>
									</DropdownMenu> */}
								</div>

								<div className="grid grid-cols-1 gap-4">
									{/* <Datatable<Printer>
										table={tablePrinters}
										columns={colsPrinter}
										data={printerData || []}
									/> */}
								</div>

								<div className="flex items-center justify-end space-x-2 py-4">
									{/* <div className="text-muted-foreground flex-1 text-sm">
										{tablePrinters.getFilteredSelectedRowModel().rows.length} of{" "}
										{formattedTotalRecords} row(s) selected.
									</div>

									<div className="text-sm text-muted-foreground mr-4">
										Page {tablePrinters.getState().pagination.pageIndex + 1} of{" "}
										{tablePrinters.getPageCount()} (Total records:{" "}
										{formattedTotalRecords})
									</div>
									<div className="space-x-2">
										<Button
											variant="outline"
											size="sm"
											onClick={() => tablePrinters.previousPage()}
											disabled={!tablePrinters.getCanPreviousPage()}
										>
											Previous
										</Button>
										<Button
											variant="outline"
											size="sm"
											onClick={() => tablePrinters.nextPage()}
											disabled={!tablePrinters.getCanNextPage()}
										>
											Next
										</Button>
									</div> */}
								</div>
							</div>
						)}
					</div>
				</CardContent>

				{/* NEW: Schedule Details Dialog */}
				<Dialog
					open={isScheduleDetailsDialogOpen}
					onOpenChange={setIsScheduleDetailsDialogOpen}
				>
					{/* DialogTrigger is not needed here as we control `open` state manually */}
					<DialogContent
						aria-describedby="dialog-description"
						className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto"
					>
						<p id="dialog-description">Schedule</p>
						<DialogHeader>
							<DialogTitle>Schedule Details</DialogTitle>
							<DialogDescription>
								Schedule details of the selected printer.
							</DialogDescription>
						</DialogHeader>
						{/* Render PrinterComponents inside the dialog */}
						{printerDetailSerialNo && (
							<div className="w-full">
								<div className="flex items-center py-4 gap-2">
									{/* <Input
										placeholder="Filter all columns..."
										value={globalFilterPrinters ?? ""}
										onChange={(event) =>
											setGlobalFilterPrinters(event.target.value)
										}
										className="max-w-sm"
									/> */}
									{/* <Switch
										id="maintainAll"
										onCheckedChange={(checked) => console.log(checked)}
									/>
									<Label htmlFor="maintainAll">Maintain All</Label> */}
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button variant="outline" className="ml-auto">
												Columns <ChevronDown />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											{/* {tablePrinters
												.getAllColumns()
												.filter((column) => column.getCanHide())
												.map((column) => {
													return (
														<DropdownMenuCheckboxItem
															key={column.id}
															className="capitalize"
															checked={column.getIsVisible()}
															onCheckedChange={(value) =>
																column.toggleVisibility(!!value)
															}
														>
															{column.id}
														</DropdownMenuCheckboxItem>
													);
												})} */}
										</DropdownMenuContent>
									</DropdownMenu>
								</div>

								<div className="grid grid-cols-1 gap-4">
									{/* <Datatable<Printer>
										table={tablePrinters}
										columns={colsPrinter}
										data={printerData || []}
									/> */}
								</div>

								<div className="flex items-center justify-end space-x-2 py-4">
									{/* <div className="text-muted-foreground flex-1 text-sm">
										{tablePrinters.getFilteredSelectedRowModel().rows.length} of{" "}
										{formattedTotalRecords} row(s) selected.
									</div>

									<div className="text-sm text-muted-foreground mr-4">
										Page {tablePrinters.getState().pagination.pageIndex + 1} of{" "}
										{tablePrinters.getPageCount()} (Total records:{" "}
										{formattedTotalRecords})
									</div>
									<div className="space-x-2">
										<Button
											variant="outline"
											size="sm"
											onClick={() => tablePrinters.previousPage()}
											disabled={!tablePrinters.getCanPreviousPage()}
										>
											Previous
										</Button>
										<Button
											variant="outline"
											size="sm"
											onClick={() => tablePrinters.nextPage()}
											disabled={!tablePrinters.getCanNextPage()}
										>
											Next
										</Button>
									</div> */}
								</div>
							</div>
						)}
					</DialogContent>
				</Dialog>

				{/* NEW: Printer Details Dialog */}
				<Dialog
					open={isPrinterDetailsDialogOpen}
					onOpenChange={setIsPrinterDetailsDialogOpen}
				>
					{/* DialogTrigger is not needed here as we control `open` state manually */}
					<DialogContent
						aria-describedby="dialog-description"
						className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto"
					>
						<p id="dialog-description">
							Details and maintenance history for the selected printer.
						</p>
						<DialogHeader>
							<DialogTitle>Printer Details</DialogTitle>
							<DialogDescription>
								Details and maintenance history for the selected printer.
							</DialogDescription>
						</DialogHeader>
						{/* Render PrinterComponents inside the dialog */}
						{printerDetailSerialNo && (
							<PrinterComponents serialNo={printerDetailSerialNo} />
						)}
					</DialogContent>
				</Dialog>

				<LoadingSpinnerModal
					isOpen={isLoadingMaintenanceMutation}
					message="Loading Data..."
				/>
			</Card>
		</div>
		</ScrollArea>
	);
}

// async function philippineTime() {
// 	const phTime = await getPHTime();
// 	return phTime;

// 	// console.log("Current PH Time:", phTime);
// 	// Output: Current PH Time: 08/11/2025 08:15:30 PM
// }
