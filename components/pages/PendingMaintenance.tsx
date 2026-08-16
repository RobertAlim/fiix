"use client";

import PendingMaintenancePanel from "./PendingMaintenancePanel";

// Recreates the same Missed Schedules + Pending Maintenance interface
// already embedded at the top of the Schedule page (components/
// pages/Schedule.tsx still renders <PendingMaintenancePanel /> there too —
// this nav entry just gives it a direct, standalone destination for anyone
// who wants to triage outstanding maintenance without opening Schedule).
export default function PendingMaintenancePage() {
	return (
		<div className="space-y-6">
			<PendingMaintenancePanel />
		</div>
	);
}
