/**
 * Date/time formatting for Fiix. Every function here renders in Asia/Manila
 * regardless of where the code runs, which matters in two different ways:
 *
 *  - Server-side (Vercel functions, PDF generation) the runtime clock is
 *    UTC, so any formatter that leans on the ambient timezone renders 8
 *    hours behind Philippine Standard Time. That is exactly what went wrong
 *    on the maintenance report PDF.
 *  - Client-side it happens to be right for a device set to Manila, but
 *    silently wrong for one that isn't. Pinning the zone makes it correct
 *    by construction instead of by luck.
 *
 * The `maintain.createdAt` / `scheduleDetails.maintainedDate` columns are
 * Postgres `timestamp` WITHOUT time zone, storing UTC wall-clock (the
 * session TimeZone is UTC on Neon). Drizzle's driver reads them back as
 * real UTC instants, and JSON transport turns them into ISO-8601 strings
 * ending in "Z" — so converting to Manila for display is a pure
 * presentation concern, no stored value changes.
 */

export const PH_TIME_ZONE = "Asia/Manila";

/**
 * Normalizes anything date-shaped into a Date carrying the correct instant.
 *
 * The guard matters: a bare Postgres timestamp string with no zone marker
 * ("2025-09-26 11:40:54.122624") is interpreted by the Date constructor as
 * *local* time, which would re-introduce the exact drift this module
 * exists to remove. Those get an explicit "Z" appended first, since UTC is
 * what the column actually holds. Strings that already carry a zone (the
 * usual "...Z" from JSON, or a +08:00 offset) are left alone.
 */
function toInstant(value: Date | string | number): Date {
	if (value instanceof Date) return value;
	if (typeof value === "number") return new Date(value);

	const trimmed = value.trim();
	const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
	const looksLikeBareTimestamp = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(trimmed);

	if (!hasZone && looksLikeBareTimestamp) {
		return new Date(`${trimmed.replace(" ", "T")}Z`);
	}
	return new Date(trimmed);
}

function isValid(date: Date): boolean {
	return !Number.isNaN(date.getTime());
}

/** "Sep 26, 2025" in Manila. Returns an em dash for missing input. */
export function formatDateManila(dateIso: string | null | undefined) {
	if (!dateIso) return "—";
	try {
		const d = toInstant(dateIso);
		if (!isValid(d)) return dateIso;
		return d.toLocaleString("en-PH", {
			timeZone: PH_TIME_ZONE,
			year: "numeric",
			month: "short",
			day: "2-digit",
		});
	} catch {
		return dateIso ?? "—";
	}
}

/**
 * "MM/dd/yyyy hh:mm a" in Philippine Standard Time — the canonical
 * date/time stamp used on the maintenance report (both the PDF and its
 * on-screen preview).
 *
 * This replaces the previous `formatUtc`, which pulled the UTC components
 * off the instant and rendered them verbatim. That was consistent, but it
 * printed a report signed at 3:00 PM in Manila as 7:00 AM.
 *
 * @throws if the value can't be parsed as a date — a report stamped with a
 * silently wrong or empty date is worse than a loud failure.
 */
export function formatPhDateTime(value: Date | string | number): string {
	const date = toInstant(value);
	if (!isValid(date)) {
		throw new Error(`Invalid date value provided: ${String(value)}`);
	}

	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: PH_TIME_ZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: true,
	}).formatToParts(date);

	const get = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((p) => p.type === type)?.value ?? "";

	// Built from parts rather than a formatted string so the output shape is
	// fixed ("09/26/2025 03:00 PM") and can't shift with an ICU/locale
	// update — the PDF layout depends on this width.
	return `${get("month")}/${get("day")}/${get("year")} ${get("hour")}:${get(
		"minute"
	)} ${get("dayPeriod").toUpperCase()}`;
}

/**
 * "03:00 PM" in Philippine Standard Time.
 *
 * Previously read the hours/minutes off the ambient timezone, which is
 * correct only on a device already set to Manila.
 */
export function formatTimeToAmPm(datetimeString: string): string {
	if (!datetimeString || datetimeString.trim() === "") {
		return datetimeString;
	}

	const date = toInstant(datetimeString);
	if (!isValid(date)) {
		throw new Error(`Invalid datetime string provided: ${datetimeString}`);
	}

	return date
		.toLocaleTimeString("en-US", {
			timeZone: PH_TIME_ZONE,
			hour: "2-digit",
			minute: "2-digit",
			hour12: true,
		})
		.toUpperCase();
}
