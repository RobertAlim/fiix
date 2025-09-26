export function formatDateManila(dateIso: string | null | undefined) {
	if (!dateIso) return "—";
	try {
		// Use toLocaleString for Asia/Manila
		const d = new Date(dateIso);
		return d.toLocaleString("en-PH", {
			timeZone: "Asia/Manila",
			year: "numeric",
			month: "short",
			day: "2-digit",
		});
	} catch {
		return dateIso ?? "—";
	}
}

/**
 * Converts a datetime string to a time string in the "hh:mm AM/PM" format.
 * @param datetimeString The datetime string to convert (e.g., "2025-09-26 11:40:54.122624").
 * @returns The formatted time string (e.g., "11:40 AM").
 */
export function formatTimeToAmPm(datetimeString: string): string {
	// 1. Create a Date object from the input string.
	// NOTE: The Date constructor can usually parse this standard format.

	if (!datetimeString || datetimeString.trim() === "") {
		return datetimeString;
	}

	const date = new Date(datetimeString);

	// Check for invalid date (e.g., if parsing failed)
	if (isNaN(date.getTime())) {
		throw new Error(`Invalid datetime string provided: ${datetimeString}`);
	}

	// 2. Get the hours and minutes.
	let hours = date.getHours();
	const minutes = date.getMinutes();

	// 3. Determine AM/PM and convert hours to 12-hour format.
	const ampm = hours >= 12 ? "PM" : "AM";

	// Convert 24-hour format to 12-hour format (0 becomes 12, 13-23 becomes 1-11)
	hours = hours % 12;
	// The hour '0' should be '12' in 12-hour format
	hours = hours ? hours : 12;

	// 4. Pad hours and minutes with a leading zero if they are less than 10.
	const hoursStr = String(hours).padStart(2, "0");
	const minutesStr = String(minutes).padStart(2, "0");

	// 5. Combine and return the formatted string.
	return `${hoursStr}:${minutesStr} ${ampm}`;
}
