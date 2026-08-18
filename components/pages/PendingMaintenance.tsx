"use client";

import PendingMaintenancePanel from "./PendingMaintenancePanel";

// The full Pending Maintenance interface, including the Resolve action —
// exclusive to this nav page. The Schedule page also embeds
// PendingMaintenancePanel (components/pages/Schedule.tsx), but passes
// `readOnly`, which hides Resolve there; this is the only place it's
// reachable. The old "Missed Schedules" card that used to live inside
// this same panel has been replaced entirely by the Unmaintained Printers
// list on the Schedule page (components/UnmaintainedPrintersPanel.tsx) —
// it's no longer part of this component at all, on either page.
export default function PendingMaintenancePage() {
	return (
		<div className="space-y-6">
			<PendingMaintenancePanel />
		</div>
	);
}
