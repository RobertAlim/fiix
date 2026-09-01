// app/api/monitoring-report/route.ts
//
// Backend for the Monitoring report (components/pages/Monitoring.tsx) —
// mirrors app/api/maintain-report/route.ts's role gating (the same people
// who can see the Maintenance report can see Monitoring; see
// lib/permissions.ts's "reportMonitoring" module, which additionally keeps
// Scheduler access so itinerary planning can lean on it) but is its own
// route/query since the two reports show fundamentally different data.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/require-role";
import { parseMonitoringMonth, fetchMonitoringReportRows } from "@/lib/server/monitoring-report-query";

export async function GET(req: Request) {
	const auth = await requireRole(["Admin", "Scheduler"]);
	if (auth.error) return auth.error;

	const monthParam = new URL(req.url).searchParams.get("month");
	const parsed = parseMonitoringMonth(monthParam);
	if (!parsed.ok) {
		return NextResponse.json({ error: parsed.error }, { status: 400 });
	}

	const rows = await fetchMonitoringReportRows(parsed);
	return NextResponse.json({
		month: parsed.month,
		year: parsed.year,
		rows,
	});
}
