// hooks/use-schedules.ts
import { useQuery } from "@tanstack/react-query";
import { cachedJsonFetch } from "@/features/offline-sync";

// Existing interfaces...
export interface Technician {
	firstName: string;
	lastName: string;
}
export interface Client {
	name: string;
}
export interface Location {
	name: string;
}
export interface PriorityLevel {
	name: string;
}
export interface Status {
	id: number;
	name: string;
} // New Status interface
export interface Department {
	id: number;
	name: string;
} // New Department interface
export interface Model {
	id: number;
	name: string;
} // New Model interface

// New Maintain interface
export interface Maintain {
	id: number;
	printerId: number;
	notes: string | null;
	statusId: number;
	status: Status; // Nested status object
	createdAt: string; // To get the latest
	signPath: string;
	// ... include other fields from your maintain table
}

export interface Printer {
	id: number;
	serialNo: string;
	modelId: number;
	model: Model; // Nested model object
	departmentId: number;
	department: Department; // Nested department object
	maintenanceRecords: Maintain[]; // A printer can have MANY maintain records
	// ... other printer fields
}

export interface ScheduleDetail {
	id: number;
	scheduleId: number;
	printerId: number;
	originMTId: number;
	isMaintained: boolean;
	maintainedDate: string;
	printer: Printer; // Nested printer object
	maintainRecord: Maintain;
}

export interface Schedule {
	id: number;
	technicianId: number;
	clientId: number;
	locationId: number;
	priority: number;
	notes: string | null;
	signPath: string;
	maintainAll: boolean;
	scheduledAt: string;
	/** Visit order within the technician's day, set by the Scheduler. Null
	 * for schedules created before sequencing existed or never reordered. */
	sequence: number | null;
	createdAt: string;
	scheduleDetails: ScheduleDetail[];
	technician: Technician;
	client: Client;
	location: Location;
	priorityLevel: PriorityLevel;
}

interface UseSchedulesProps {
	technicianId?: number;
	scheduledAt?: string;
}

export const useSchedules = ({
	technicianId,
	scheduledAt,
}: UseSchedulesProps) => {
	return useQuery<Schedule[]>({
		queryKey: ["schedules", { technicianId, scheduledAt }],
		queryFn: () => {
			const params = new URLSearchParams();
			if (technicianId) {
				params.append("technicianId", technicianId.toString());
			}
			if (scheduledAt) {
				params.append("scheduledAt", scheduledAt);
			}
			const qs = params.toString();
			// Cached so the itinerary itself is still viewable offline — this is
			// what the technician taps into the Maintenance page from.
			return cachedJsonFetch<Schedule[]>(
				`/api/schedule?${qs}`,
				`schedules:${technicianId ?? "all"}:${scheduledAt ?? "any"}`
			);
		},
	});
};
