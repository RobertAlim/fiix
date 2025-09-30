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
 * Converts a UTC datetime string (ISO 8601 format ending in 'Z') to the "MM/dd/yyyy hh:mm a" format.
 * * @param utcDateTimeString The UTC date string to convert (e.g., "2025-09-26T11:51:38.348Z").
 * @returns The formatted date and time string (e.g., "09/26/2025 11:51 AM").
 * @throws {Error} If the provided string is not a valid date.
 */
export function formatUtc(utcDateTimeString: string): string {
	// 1. Create a Date object. The 'Z' ensures it's treated as UTC.
	const date: Date = new Date(utcDateTimeString);

	// Linting & TypeScript Safety: Check for an invalid date
	if (isNaN(date.getTime())) {
		throw new Error(`Invalid date string provided: ${utcDateTimeString}`);
	}

	// 2. Extract Components (using UTC methods since the input is Z-time and we want the UTC time formatted)
	// NOTE: When using standard Date methods (getMonth, getHours, etc.), they return values
	// in the local timezone of the running machine. To strictly adhere to the UTC time
	// specified by the 'Z' in the input string, we MUST use the UTC methods (getUTCMonth, getUTCHours, etc.).

	// Date components (UTC)
	const year: number = date.getUTCFullYear();
	// getUTCMonth is 0-indexed, so we add 1
	const month: number = date.getUTCMonth() + 1;
	const day: number = date.getUTCDate();

	// Time components (UTC)
	let hours24: number = date.getUTCHours();
	const minutes: number = date.getUTCMinutes();

	// 3. Convert to 12-hour format and determine AM/PM
	const ampm: string = hours24 >= 12 ? "PM" : "AM";

	// Convert 24-hour hour (0-23) to 12-hour hour (1-12)
	let hours12: number = hours24 % 12;
	// The hour '0' should be '12' in 12-hour format
	hours12 = hours12 === 0 ? 12 : hours12;

	// 4. Pad single-digit numbers with a leading zero
	// Helper function for padding to ensure type safety and avoid repetition
	const pad = (num: number): string => String(num).padStart(2, "0");

	const monthStr: string = pad(month);
	const dayStr: string = pad(day);
	const hoursStr: string = pad(hours12);
	const minutesStr: string = pad(minutes);

	// 5. Construct the final string "MM/dd/yyyy hh:mm a"
	return `${monthStr}/${dayStr}/${year} ${hoursStr}:${minutesStr} ${ampm}`;
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
