//Schedule.tsx
import React, { useEffect, useCallback } from "react"; // Keep React imported
import { Card, CardContent } from "@/components/ui/card";
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
import { Datatable } from "@/components/ui/data-table";
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
	PaginationState,
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

//THIS IS 4 DELETION//
// interface PrinterData {
// 	printerId: number;
// 	department: string;
// 	model: string;
// 	serialNo: string;
// 	issue: string;
// 	lastMT: Date;
// 	mtId: number;
// 	schedDetailsId: number;
// }

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
	actions: string; // Action to be performed, e.g., "Add Schedule" or "Update Schedule";
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
	const response = await fetch("/api/schedule", {
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

export default function SchedulePage() {
	// let printerData: Printer[] | undefined;
	// const printers: PrinterData[] = [
	// 	{
	// 		printerId: 101,
	// 		department: "HR",
	// 		model: "Epson C5790",
	// 		serialNo: "EPN-C5790-HR-001",
	// 		issue: "No Issue",
	// 		lastMT: new Date("2024-07-20"), // Current date around July 30, 2025 (adjusted for user query time)
	// 		mtId: 5001,
	// 		schedDetailsId: 9001,
	// 	},
	// 	{
	// 		printerId: 102,
	// 		department: "IT",
	// 		model: "HP LaserJet M404n",
	// 		serialNo: "HPJ-M404N-IT-002",
	// 		issue: "Low on Black Ink",
	// 		lastMT: new Date("2025-06-10"),
	// 		mtId: 5002,
	// 		schedDetailsId: 9002,
	// 	},
	// 	{
	// 		printerId: 103,
	// 		department: "Finance",
	// 		model: "Brother HL-L2350DW",
	// 		serialNo: "BRL-2350D-FN-003",
	// 		issue: "Paper Jam",
	// 		lastMT: new Date("2025-07-28"),
	// 		mtId: 5003,
	// 		schedDetailsId: 9003,
	// 	},
	// 	{
	// 		printerId: 104,
	// 		department: "Marketing",
	// 		model: "Canon Pixma TS6320",
	// 		serialNo: "CPX-6320-MK-004",
	// 		issue: "Offline",
	// 		lastMT: new Date("2025-07-01"),
	// 		mtId: 5004,
	// 		schedDetailsId: 9004,
	// 	},
	// 	{
	// 		printerId: 105,
	// 		department: "Sales",
	// 		model: "Lexmark B2236dw",
	// 		serialNo: "LXM-B2236-SL-005",
	// 		issue: "No Issue",
	// 		lastMT: new Date("2025-07-25"),
	// 		mtId: 5005,
	// 		schedDetailsId: 9005,
	// 	},
	// 	{
	// 		printerId: 106,
	// 		department: "Operations",
	// 		model: "Epson C5790",
	// 		serialNo: "EPN-C5790-OP-006",
	// 		issue: "Fading Prints",
	// 		lastMT: new Date("2025-05-15"),
	// 		mtId: 5006,
	// 		schedDetailsId: 9006,
	// 	},
	// 	{
	// 		printerId: 107,
	// 		department: "HR",
	// 		model: "HP LaserJet M404n",
	// 		serialNo: "HPJ-M404N-HR-007",
	// 		issue: "Maintenance Required",
	// 		lastMT: new Date("2025-04-01"),
	// 		mtId: 5007,
	// 		schedDetailsId: 9007,
	// 	},
	// ];
	// THIS IS 4 DELETION
	// let printers: Printer[] | undefined;

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
	const [immediatePrinters, setImmediatePrinters] = useState<
		Printer[] | undefined
	>(undefined);

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
		onSuccess: (data) => {
			showAppToast({
				message: data.message || "Schedule successfully created!",
				description: "Success",
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
			data: allOpenIssues,
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
	} = useQuery<Schedule[], Error>({
		queryKey: ["schedules", selectedTechnicianId, scheduleDate],
		queryFn: () => {
			const scheduledAt = format(
				fetchedScheduleData ? new Date(scheduleDate!) : new Date("1900-01-01"),
				"yyyy-MM-dd"
			);
			return fetchData<Schedule[]>(
				`/api/schedule?technicianId=${selectedTechnicianId}&scheduledAt=${scheduledAt}&pageSource="Schedule"`
			);
		},
		enabled: !!selectedClientId && !!selectedLocationId,
		staleTime: 1000 * 60 * 1,
		placeholderData: (previousData) => previousData, // Keep this if you want to show previous data while refetching
		retry: false,
	});

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

	// --- Data Transformation for ComboBoxResponsive (using useMemo for stability) ---

	const clientComboboxData: ComboboxItem[] = useMemo(() => {
		return (allClients ?? []).map((client) => ({
			value: client.id,
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
			value: location.id,
			label: location.name,
		}));
	}, [filteredLocations]); // Only recompute if filteredLocations changes

	const technicianComboboxData: ComboboxItem[] = useMemo(() => {
		return (allTechnicians ?? []).map((tech) => ({
			value: tech.id,
			label: tech.name,
		}));
	}, [allTechnicians]); // Only recompute if allTechnicians array reference changes

	const priorityComboboxData: ComboboxItem[] = useMemo(() => {
		return (allPriorities ?? []).map((priority) => ({
			value: priority.id,
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
	// const [paginationSchedules, setPaginationSchedules] =
	// 	useState<PaginationState>({
	// 		pageIndex: 0,
	// 		pageSize: 5,
	// 	});

	// // Define your initial row selection state
	// const getInitialRowSelection = (data: Printer[]): RowSelectionState => {
	// 	const initialState: RowSelectionState = {};
	// 	if (Array.isArray(data)) {
	// 		data?.forEach((printer) => {
	// 			if (
	// 				printer.schedDetailsId !== null &&
	// 				printer.schedDetailsId !== undefined
	// 			) {
	// 				initialState[printer.id.toString()] = true;
	// 			}
	// 		});
	// 	}
	// 	return initialState;
	// };

	// const [rowSelectionPrinters, setRowSelectionPrinters] =
	// 	useState<RowSelectionState>(() =>
	// 		getInitialRowSelection(printerData || [])
	// 	);

	// React.useEffect(() => {
	// 	// This useEffect ensures that if printerData changes after initial render,
	// 	// the row selection state is re-evaluated.
	// 	setRowSelectionPrinters(getInitialRowSelection(printerData || []));
	// }, [printerData]); // Re-run when printerData changes
	const scheduleData = fetchedScheduleData || []; // Fallback to empty array if undefined

	// useEffect(() => {
	// 	// Only once on mount
	// 	if (immediatePrinters) {
	// 		const initialEdits: Record<string, Partial<Printer>> = {};
	// 		for (const p of immediatePrinters) {
	// 			if (p.schedDetailsId !== null && p.isMaintained === false) {
	// 				initialEdits[p.id.toString()] = { isToggled: true };
	// 			}
	// 		}
	// 		setEdits((prev) => ({ ...prev, ...initialEdits }));
	// 	}
	// }, [immediatePrinters]);
	// Determine if other controls should be enabled

	React.useEffect(() => {
		async function fetchTime() {
			const res = await fetch("/api/ph-time");
			const data = await res.json();
			setCurrentDate(data.time);
		}
		fetchTime();
	}, []);

	React.useEffect(() => {
		if (isSchedulesSuccess && scheduleData.length === 0 && !isSetupModalOpen) {
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
	}, [scheduleData, isSchedulesSuccess, isSetupModalOpen]); // Re-run when scheduleData changes

	const areControlsEnabled = isEditing || isAdding!;

	// --- Handlers for Printer Actions (from columns) ---
	// const handleMaintenanceHistory = React.useCallback(
	// 	(serialNo: string) => {
	// 		showAppToast({
	// 			message: `Viewing maintenance history for printer serial no.: ${serialNo}`,
	// 			description: "History Information",
	// 			position: "top-right",
	// 			color: "info",
	// 		});
	// 		// You could open another dialog or navigate to a history page here
	// 	},
	// 	[setPrinterDetailSerialNo, setIsPrinterDetailsDialogOpen]
	// );

	// NEW: Handler to open the Printer Details dialog
	// const handleShowPrinterDetails = React.useCallback(
	// 	(serialNo: string) => {},
	// 	[setPrinterDetailSerialNo, setIsPrinterDetailsDialogOpen]
	// );

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

	// --- Refined useEffect for Location ID synchronization ---
	useEffect(() => {
		// This effect runs when isEditing, selectedClientId, filteredLocations, schedules, or scheduleId changes.
		// It's designed to set the location ID *after* the client is selected
		// and the dependent 'filteredLocations' array has been computed based on that client.

		// console.log("Location Sync useEffect: triggered.");
		// console.log("isEditing:", isEditing);
		// console.log("selectedClientId:", selectedClientId);
		// console.log("filteredLocations (in useEffect):", filteredLocations);
		// console.log("scheduleId (in useEffect):", scheduleId);
		// console.log("allLocations loading:", isLoadingAllLocations);

		// Condition 1: We are in "editing" mode
		// Condition 2: A client has been selected (which triggers location filtering/loading)
		// Condition 3: We have the actual scheduleId to look up the target location
		// Condition 4: filteredLocations is NOT empty (meaning data has been processed/loaded for this client)
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
			}),
		[handleEditSchedule, handleDeleteSchedule, handleShowDetails] // Dependencies
	);

	// useEffect(() => {
	// 	if (!immediatePrinters) return;

	// 	const initialEditEntries: Record<string, Partial<Printer>> = {};

	// 	immediatePrinters.forEach((printer) => {
	// 		if (printer.isMaintained === false && printer.schedDetailsId !== null) {
	// 			initialEditEntries[printer.id.toString()] = {
	// 				isToggled: true, // or whatever initial override you want
	// 			};
	// 		}
	// 	});

	// 	setEdits((prev) => ({
	// 		...initialEditEntries, // load only once
	// 		...prev, // preserve anything already set (probably empty on first run)
	// 	}));
	// }, [immediatePrinters]);

	const handlePrinterToggle = useCallback(
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

	// --- Memoize Printer Columns ---
	// Pass the new handler to the columns
	// const colsPrinter: ColumnDef<Printer>[] = useMemo(
	// 	() =>
	// 		getPrinterColumns({
	// 			onShowDetailsClick: handleShowPrinterDetails, // Pass the new handler
	// 		}),
	// 	[handleShowPrinterDetails] // Dependencies
	// );

	// const tablePrinters = useReactTable({
	// 	data: printerData || [],
	// 	columns: colsPrinter,
	// 	onSortingChange: setSortingPrinters,
	// 	onColumnFiltersChange: setColumnFiltersPrinters,
	// 	getCoreRowModel: getCoreRowModel(),
	// 	getPaginationRowModel: getPaginationRowModel(),
	// 	getSortedRowModel: getSortedRowModel(),
	// 	getFilteredRowModel: getFilteredRowModel(),
	// 	onColumnVisibilityChange: setColumnVisibilityPrinters,
	// 	// onRowSelectionChange: setRowSelectionPrinters,
	// 	onPaginationChange: setPaginationPrinters,
	// 	state: tablePrintersState,
	// 	onGlobalFilterChange: setGlobalFilterPrinters,
	// });

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

	// const totalRecordsCount = tablePrinters.getFilteredRowModel().rows.length;
	// const formattedTotalRecords = totalRecordsCount.toLocaleString();

	const handleSchedule = async (event: React.MouseEvent<HTMLButtonElement>) => {
		const buttonText = event.currentTarget.textContent || "";

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
			alert("Please select both a technician and a date."); // Simple validation
		}
	};

	return (
		<div className="moving-gradient-border">
			<Card className="rounded-2xl bg-white dark:bg-black">
				<CardContent className="p-6 space-y-4">
					<div className="grid lg:grid-cols-3 grid-cols-1 gap-4">
						<div className="col-span-1 space-y-2">
							{/* ** Combined Technician & Date Selection Modal ** */}
							<Dialog
								open={isSetupModalOpen}
								onOpenChange={setIsSetupModalOpen}
							>
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
											Confirm Selections
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
								disabled={!areControlsEnabled || scheduleData.length === 0}
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
									!areControlsEnabled ||
									scheduleData.length === 0
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
								disabled={!areControlsEnabled || scheduleData.length === 0}
							/>
							<Textarea
								id="notes"
								placeholder="Leave a note here"
								value={notes || ""}
								onChange={(e) => setNotes(e.target.value)}
								disabled={!areControlsEnabled || scheduleData.length === 0}
							/>
						</div>
						<div className="col-span-2">
							{/* Sheet component (unrelated to the primary issue, but kept for completeness) */}
							<Sheet>
								<SheetTrigger asChild>
									<Button variant="outline">Open Issues</Button>
								</SheetTrigger>
								<SheetContent className="w-[540px] md:w-[400px] flex flex-col">
									<SheetHeader>
										<SheetTitle>Current Open Issues</SheetTitle>
										<SheetDescription>
											These are unresolved printer issues that are actively
											being monitored or awaiting action.
										</SheetDescription>
									</SheetHeader>
									<div className="flex-1 overflow-y-auto px-4">
										{" "}
										{/* Added h-full here for parent to occupy full height */}
										<div className="grid gap-6">
											{" "}
											{/* Changed to flex-col and added overflow-y-auto */}
											{allOpenIssues!.map((issue) => (
												<OpenIssueComponent key={issue.id} {...issue} />
											))}
										</div>
									</div>
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
								// disabled={!isEditing || !isAdding} // Disable if scheduleData has items and in editing mode
							>
								{isEditing ? "Update Schedule" : "Add Schedule"}
							</Button>

							<Separator className="my-2" />

							<Datatable<Schedule>
								table={tableSchedules}
								columns={colsSchedule}
								data={scheduleData || []}
							/>
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
	);
}

// async function philippineTime() {
// 	const phTime = await getPHTime();
// 	return phTime;

// 	// console.log("Current PH Time:", phTime);
// 	// Output: Current PH Time: 08/11/2025 08:15:30 PM
// }
