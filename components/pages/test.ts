//Schedule.tsx
import React from "react"; // Keep React imported
import { Card, CardContent } from "@/components/ui/card";
import { ComboBoxResponsive, ComboboxItem } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { fetchData } from "@/lib/fetchData";
import { useState, useMemo } from "react";
import { format } from "date-fns";
import {
	getPrinterColumns,
	Printer,
} from "@/components/columns/printers/columns";
import {
	columns as colsSchedule,
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
	SheetClose,
	SheetFooter,
} from "@/components/ui/sheet";
import {
	ColumnDef,
	ColumnFiltersState,
	flexRender,
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
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
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
	printers: {
		// <--- Ito na ngayon ang Array of Objects
		printerId: number; // Ang ID ng printer (base sa error na 'number')
		mtId: number; // Ang MT ID ng printer (base sa error na 'number')
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

	// State to control if the combined modal is open
	const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);

	// Determine if other controls should be enabled
	const areControlsEnabled =
		selectedTechnicianId !== null && scheduleDate !== undefined;

	// NEW STATES for Printer Details Dialog
	const [printerDetailSerialNo, setPrinterDetailSerialNo] = useState<
		string | null
	>(null);
	const [isPrinterDetailsDialogOpen, setIsPrinterDetailsDialogOpen] =
		useState(false);

	// Get query client for invalidation
	const queryClient = useQueryClient();

	// Setup the useMutation hook
	const {
		mutate, // The function to call to trigger the mutation
		isPending: isLoadingMaintenanceMutation, // True while the mutation is in progress
		isSuccess, // True if the mutation was successful
		isError: isMutationError, // True if the mutation failed
		error: mutationError, // The error object if the mutation failed
		reset, // Function to reset the mutation state
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

			// Optionally, clear form/table selection after successful submission
			// tablePrinters.toggleAllRowsSelected(false); // Deselect all checked rows
			// setScheduleDate(undefined); // Clear date picker
			// setSelectedTechnicianId(null); // Clear technician
			// // Reset client/location if desired after submission
			// setSelectedClientId("0");
			// setSelectedLocationId("0");
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
		isPending: isLoadingPrinters,
		isError: isErrorPrinters,
		error: printersError,
	} = useQuery<Printer[], Error>({
		queryKey: ["printers", selectedClientId, selectedLocationId],
		queryFn: () => {
			return fetchData<Printer[]>(
				`/api/printers?clientId=${selectedClientId}&locationId=${selectedLocationId}`
			);
		},
		enabled: !!selectedClientId && !!selectedLocationId,
		staleTime: 1000 * 60 * 1,
		placeholderData: (previousData) => previousData, // Keep this if you want to show previous data while refetching
	});

	// --- Dependent Data Fetching (Printer data based on selectedLocationId AND selectedClientId) ---
	const {
		data: scheduleData,
		isPending: isLoadingSchedules,
		isError: isErrorSchedules,
		error: schedulesError,
	} = useQuery<Schedule[], Error>({
		queryKey: [
			"schedules",
			selectedClientId,
			selectedLocationId,
			selectedTechnicianId,
			scheduleDate,
		],
		queryFn: () => {
			const scheduledAt = format(
				scheduleData ? new Date(scheduleDate!) : new Date("1900-01-01"),
				"yyyy-MM-dd"
			);
			return fetchData<Schedule[]>(
				`/api/schedule?clientId=${selectedClientId}&locationId=${selectedLocationId}&technicianId=${selectedTechnicianId}&scheduledAt=${scheduledAt}&pageSource="Schedule"`
			);
		},
		enabled: !!selectedClientId && !!selectedLocationId,
		staleTime: 1000 * 60 * 1,
		placeholderData: (previousData) => previousData, // Keep this if you want to show previous data while refetching
	});

	// Combined Loading and Error states
	const overallLoading =
		isLoadingClients ||
		isLoadingAllLocations ||
		isLoadingTechnicians ||
		isLoadingPriorities ||
		// isLoadingPrinters ||
		isLoadingOpenIssues;

	const overallError =
		isErrorClients ||
		isErrorAllLocations ||
		isErrorTechnicians ||
		isErrorPriorities ||
		// isErrorPrinters ||
		isErrorOpenIssues;

	// --- Data Transformation for ComboBoxResponsive (using useMemo for stability) ---

	const clientComboboxData: ComboboxItem[] = useMemo(() => {
		return (allClients ?? []).map((client) => ({
			value: client.id,
			label: client.name,
		}));
	}, [allClients]); // Only recompute if allClients array reference changes

	const filteredLocations: Location[] = useMemo(() => {
		// If allLocations is still loading or undefined, return an empty array
		if (isLoadingAllLocations || !allLocations) {
			return [];
		}
		return selectedClientId
			? allLocations.filter((loc) => loc.clientId === selectedClientId)
			: [];
	}, [selectedClientId, allLocations, isLoadingAllLocations]); // Recompute if selectedClientId or allLocations changes

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

	// --- State for tablePrinters ---
	const [sortingPrinters, setSortingPrinters] = useState<SortingState>([]);
	const [columnFiltersPrinters, setColumnFiltersPrinters] =
		useState<ColumnFiltersState>([]);
	const [globalFilterPrinters, setGlobalFilterPrinters] = useState<string>("");
	const [columnVisibilityPrinters, setColumnVisibilityPrinters] =
		useState<VisibilityState>({});
	// const [rowSelectionPrinters, setRowSelectionPrinters] =
	// 	useState<RowSelectionState>({});
	const [paginationPrinters, setPaginationPrinters] = useState<PaginationState>(
		{
			pageIndex: 0,
			pageSize: 5,
		}
	);

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
	const [paginationSchedules, setPaginationSchedules] =
		useState<PaginationState>({
			pageIndex: 0,
			pageSize: 5,
		});

	// Define your initial row selection state
	const getInitialRowSelection = (data: Printer[]): RowSelectionState => {
		const initialState: RowSelectionState = {};
		if (Array.isArray(data)) {
			data?.forEach((printer) => {
				if (
					printer.schedDetailsId !== null &&
					printer.schedDetailsId !== undefined
				) {
					initialState[printer.id.toString()] = true;
				}
			});
		}
		return initialState;
	};

	const [rowSelectionPrinters, setRowSelectionPrinters] =
		useState<RowSelectionState>(() =>
			getInitialRowSelection(printerData || [])
		);

	React.useEffect(() => {
		// This useEffect ensures that if printerData changes after initial render,
		// the row selection state is re-evaluated.
		setRowSelectionPrinters(getInitialRowSelection(printerData || []));
	}, [printerData]); // Re-run when printerData changes

	// --- Handlers for Printer Actions (from columns) ---
	const handleMaintenanceHistory = React.useCallback(
		(serialNo: string) => {
			showAppToast({
				message: `Viewing maintenance history for printer serial no.: ${serialNo}`,
				description: "History Information",
				position: "top-right",
				color: "info",
			});
			// You could open another dialog or navigate to a history page here
		},
		[setPrinterDetailSerialNo, setIsPrinterDetailsDialogOpen]
	);

	// NEW: Handler to open the Printer Details dialog
	const handleShowPrinterDetails = React.useCallback(
		(serialNo: string) => {
			setPrinterDetailSerialNo(serialNo);
			setIsPrinterDetailsDialogOpen(true);
		},
		[setPrinterDetailSerialNo, setIsPrinterDetailsDialogOpen]
	);

	// IMPORTANT: Memoize the state object for useReactTable
	const tablePrintersState = React.useMemo(
		() => ({
			sorting: sortingPrinters,
			columnFilters: columnFiltersPrinters,
			columnVisibility: columnVisibilityPrinters,
			rowSelection: rowSelectionPrinters,
			globalFilter: globalFilterPrinters,
			pagination: paginationPrinters,
		}),
		[
			sortingPrinters,
			columnFiltersPrinters,
			columnVisibilityPrinters,
			rowSelectionPrinters,
			globalFilterPrinters,
			paginationPrinters,
		]
	);

	// IMPORTANT: Memoize the state object for useReactTable
	const tableSchedulesState = React.useMemo(
		() => ({
			sorting: sortingSchedules,
			columnFilters: columnFiltersSchedules,
			columnVisibility: columnVisibilitySchedules,
			rowSelection: rowSelectionSchedules,
			globalFilter: globalFilterSchedules,
			pagination: paginationSchedules,
		}),
		[
			sortingSchedules,
			columnFiltersSchedules,
			columnVisibilitySchedules,
			rowSelectionSchedules,
			globalFilterSchedules,
			paginationSchedules,
		]
	);

	// --- Memoize Printer Columns ---
	// Pass the new handler to the columns
	const colsPrinter: ColumnDef<Printer>[] = useMemo(
		() =>
			getPrinterColumns({
				onShowDetailsClick: handleShowPrinterDetails, // Pass the new handler
			}),
		[handleShowPrinterDetails] // Dependencies
	);

	const tablePrinters = useReactTable({
		data: printerData || [],
		columns: colsPrinter,
		onSortingChange: setSortingPrinters,
		onColumnFiltersChange: setColumnFiltersPrinters,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		onColumnVisibilityChange: setColumnVisibilityPrinters,
		onRowSelectionChange: setRowSelectionPrinters,
		onPaginationChange: setPaginationPrinters,
		state: tablePrintersState,
		onGlobalFilterChange: setGlobalFilterPrinters,
	});

	const tableSchedules = useReactTable({
		data: scheduleData || [],
		columns: colsSchedule,
		onSortingChange: setSortingSchedules,
		onColumnFiltersChange: setColumnFiltersSchedules,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		onColumnVisibilityChange: setColumnVisibilitySchedules,
		onRowSelectionChange: setRowSelectionSchedules,
		onPaginationChange: setPaginationSchedules,
		state: tableSchedulesState,
		onGlobalFilterChange: setGlobalFilterSchedules,
	});

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

	const totalRecordsCount = tablePrinters.getFilteredRowModel().rows.length;
	const formattedTotalRecords = totalRecordsCount.toLocaleString();

	const handleSchedule = (event: React.MouseEvent<HTMLButtonElement>) => {
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

		// --- ACCESSING SELECTED ROWS HERE ---
		const checkedPrinters = tablePrinters
			.getSelectedRowModel()
			.rows.map((row) => row.original);

		if (checkedPrinters.length <= 0) {
			//tablePrinters.getIsSomeRowsSelected() === false
			showAppToast({
				message: "Please select at least one printer to schedule.",
				description: "No Printers Selected",
				position: "top-right",
				color: "warning",
			});
			return;
		}

		// Example: Sending data to a new API endpoint for scheduling
		const scheduleData = {
			technicianId: selectedTechnicianId || "0",
			clientId: selectedClientId || "0",
			locationId: selectedLocationId || "0",
			priority: selectedPriorityId || "0",
			notes: notes || "",
			maintainAll: tablePrinters.getIsAllRowsSelected(),
			scheduleDate: scheduleDate,
			printers: checkedPrinters.map((printer) => ({
				printerId: printer.id,
				mtId: printer.mtId,
			})),
			actions: buttonText,
		};

		// Trigger the mutation
		mutate(scheduleData);
	};

	// Function to handle confirmation in the modal
	const handleConfirmSelections = () => {
		// You can add validation here if needed before closing
		if (tempTechnicianId && tempScheduleDate) {
			setSelectedTechnicianId(tempTechnicianId);
			setScheduleDate(tempScheduleDate);
			setIsSetupModalOpen(false); // Close the modal
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
								data={clientComboboxData}
								placeholder="Client"
								selectedValue={selectedClientId}
								onValueChange={(id) => {
									setSelectedClientId(id);
									setSelectedLocationId("0"); // Reset location when client changes
								}}
								emptyMessage="No clients found."
								disabled={!areControlsEnabled}
							/>
							{/* Location Combobox */}{" "}
							<ComboBoxResponsive
								data={locationComboboxData}
								// Updated placeholder to reflect loading state from useQueries
								placeholder={
									isLoadingAllLocations ? "Loading locations..." : "Location"
								}
								selectedValue={selectedLocationId}
								onValueChange={setSelectedLocationId}
								// Disable if client not selected or if all locations are still loading
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
								onChange={(e) => setNotes(e.target.value)}
								disabled={!areControlsEnabled}
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
								disabled={!areControlsEnabled || isLoadingSchedules}
							>
								{scheduleData && scheduleData.length > 0
									? "Update Schedule"
									: "Add Schedule"}
							</Button>

							<Separator className="mt-4" />

							<div className="w-full">
								<div className="flex items-center py-4 gap-2">
									<Input
										placeholder="Filter all columns..."
										value={globalFilterPrinters ?? ""}
										onChange={(event) =>
											setGlobalFilterPrinters(event.target.value)
										}
										className="max-w-sm"
									/>
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
									</DropdownMenu>
								</div>

								<div className="grid grid-cols-1 gap-4">
									<Datatable<Printer>
										table={tablePrinters}
										columns={colsPrinter}
										data={printerData || []}
									/>
								</div>

								<div className="flex items-center justify-end space-x-2 py-4">
									<div className="text-muted-foreground flex-1 text-sm">
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
									</div>
								</div>
							</div>
						</div>
					</div>
					<hr className="my-3" />

					<div className="grid grid-cols-1 gap-4">
						<Datatable<Schedule>
							table={tableSchedules}
							columns={colsSchedule}
							data={scheduleData || []}
						/>
					</div>
				</CardContent>

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
					isOpen={
						isLoadingSchedules ||
						isLoadingPrinters ||
						isLoadingMaintenanceMutation
					}
					message="Loading Data..."
				/>
			</Card>
		</div>
	);
}
