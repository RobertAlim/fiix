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
	/** Needed by the Collection modal (Client is auto-populated from
	 *  context, not re-picked) — `client` above is only the display
	 *  name. */
	clientId: number;
	/** True when this schedule has no printer stops — a Support Services
	 *  task rather than Technical Services. Progress (total/done/percent)
	 *  is already computed correctly for either kind server-side; this
	 *  flag is purely for display (badges, filtering). */
	isSupportService: boolean;
	/** The Support Service category ("Collection", "Billing", "2307",
	 *  "Contracts", "Others", ...) from supportServiceType.name — null
	 *  for a Technical Services schedule, or a Support Services schedule
	 *  not yet submitted by the technician (the supportServices row, and
	 *  therefore its type, doesn't exist until they do). */
	supportServiceType: string | null;
};

export type ScheduleDetailRow = {
	id: number; // scheduleDetails.id
	printerId: number;
	serialNo: string;
	model: string | null;
	isMaintained: boolean;
	maintainedDate: string | null; // ISO timestamp
	mtId: number | null; // maintain.id (if created)
	statusId: number | null; // maintain.statusId (if linked)
	signPath: string | null; // maintain.signPath (if linked)
};

/** What Task Tracker's Schedule Details panel shows for a printer-less
 *  schedule instead of the (now-empty) ScheduleDetailRow[] list — the
 *  technician's submitted Support Service: notes, photo, and outcome.
 *  Null when the schedule is printer-less but the technician hasn't
 *  submitted anything yet (still shows the Scheduler's own notes as a
 *  fallback — see task-tracker.tsx). */
export type ScheduleSupportServiceDetail = {
	id: number; // supportServices.id
	supportServiceTypeId: number;
	supportServiceType: string; // "Collection" | "Billing" | "2307 BIR Form" | "Contracts" | "Others" | ...
	status: "Achieved" | "Not Achieved" | null;
	technicianNotes: string | null;
	photoUrl: string | null;
	completedAt: string | null; // ISO timestamp
};
