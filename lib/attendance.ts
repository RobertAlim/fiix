// lib/attendance.ts
// Shared formatting/calculation rules for the attendance report, kept out of
// the route so the "1 hour lunch, human-readable duration" logic has one
// place to change instead of drifting between the route and any future
// caller (e.g. an on-screen summary).

/** Payroll cutoff: A = 1st–15th, B = 16th–end of month (28/29/30/31). */
export type PayrollCutoff = "A" | "B";

/** Inclusive [start, end] day-of-month range for a cutoff in a given month. */
export function cutoffDayRange(
	year: number,
	monthIndex0: number, // 0-based, matches Date's convention
	cutoff: PayrollCutoff
): { start: number; end: number } {
	if (cutoff === "A") return { start: 1, end: 15 };
	const lastDay = new Date(year, monthIndex0 + 1, 0).getDate();
	return { start: 16, end: lastDay };
}

/**
 * Minutes actually rendered, with a flat 1-hour lunch deduction applied
 * whenever the session spans at least an hour — matching how the standard
 * 8:00 AM–5:00 PM shift (9 hours door-to-door, 8 hours paid) is meant to be
 * read. Sessions shorter than an hour don't get an hour deducted, since that
 * would produce a negative number for someone who timed out almost
 * immediately after timing in.
 */
export function renderedMinutes(timeIn: Date, timeOut: Date): number {
	const rawMinutes = Math.max(0, (timeOut.getTime() - timeIn.getTime()) / 60000);
	const LUNCH_MINUTES = 60;
	return rawMinutes > LUNCH_MINUTES ? rawMinutes - LUNCH_MINUTES : rawMinutes;
}

/** "8 hrs 34 mins" — omits the hours/minutes segment when it's zero, but
 * always shows at least one segment ("45 mins", not ""). */
export function formatRenderedDuration(totalMinutes: number): string {
	const mins = Math.round(totalMinutes);
	const hrs = Math.floor(mins / 60);
	const remMins = mins % 60;
	if (hrs === 0) return `${remMins} min${remMins === 1 ? "" : "s"}`;
	if (remMins === 0) return `${hrs} hr${hrs === 1 ? "" : "s"}`;
	return `${hrs} hr${hrs === 1 ? "" : "s"} ${remMins} min${remMins === 1 ? "" : "s"}`;
}

/** "Thursday, August 6" — deliberately no year, matching the itinerary-set
 * SMS wording (a full date reads oddly in a text message; "Monday, July 12,
 * 2026" is used elsewhere for the attendance report, which is a different
 * audience/context). */
export function formatScheduleDayLabel(dateStr: string): string {
	// dateStr is a plain YYYY-MM-DD from the schedules table (no time
	// component). Parsing as UTC noon avoids any local-timezone rollover
	// that midnight parsing is prone to.
	const d = new Date(`${dateStr}T12:00:00Z`);
	return d.toLocaleDateString("en-US", {
		timeZone: "Asia/Manila",
		weekday: "long",
		month: "long",
		day: "numeric",
	});
}

/** YYYY-MM-DD for "today" in Asia/Manila, computed without a DB round trip
 * — the `en-CA` locale formats as ISO order, which is the trick used here. */
export function phTodayDateString(): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Manila",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date());
}

const PH_DATE_OPTS: Intl.DateTimeFormatOptions = {
	timeZone: "Asia/Manila",
	weekday: "long",
	year: "numeric",
	month: "long",
	day: "numeric",
};
const PH_TIME_OPTS: Intl.DateTimeFormatOptions = {
	timeZone: "Asia/Manila",
	hour: "2-digit",
	minute: "2-digit",
	hour12: true,
};

/** "Monday, July 12, 2026" */
export function formatItineraryDate(date: Date): string {
	return date.toLocaleDateString("en-US", PH_DATE_OPTS).replace(",", ",");
}

/** "08:00 AM" */
export function formatClockTime(date: Date): string {
	return date.toLocaleTimeString("en-US", PH_TIME_OPTS);
}
