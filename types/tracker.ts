export type ScheduleTrackerRow = {
	id: number;
	scheduledAt: string; // ISO date string
	notes: string | null;
	client: string;
	location: string;
	technician: string;
	priority: string;
	total: number;
	done: number;
	open: number;
	percent: number; // computed client-side from done/total
};

export type ScheduleDetailRow = {
	id: number; // scheduleDetails.id
	printerId: number;
	serialNo: string;
	isMaintained: boolean;
	maintainedDate: string | null; // ISO timestamp
	mtId: number | null; // maintain.id (if created)
	statusId: number | null; // maintain.statusId (if linked)
	signPath: string | null; // maintain.signPath (if linked)
};
