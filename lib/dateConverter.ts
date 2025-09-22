// utils/dateConverter.ts
import { format } from "date-fns";
import { zonedTimeToUtc } from "date-fns-tz";

/**
 * Converts a date from the Philippine timezone to a formatted UTC string.
 * This is useful for saving dates consistently to a server.
 * * @param date - The date object or ISO string to convert.
 * @param formatString - The desired output format for the date.
 * @returns The formatted date string in UTC.
 */
export const convertToPhilippineTimezone = (
	date: Date | string,
	formatString: string = "MM/dd/yyyy"
): string => {
	// Specify the timezone for the Philippines (Asia/Manila)
	const philippineTimezone = "Asia/Manila";

	// Convert the date from the local timezone (Philippines) to UTC
	const dateInUtc = zonedTimeToUtc(date, philippineTimezone);

	// Format the UTC date according to the provided format string
	return format(dateInUtc, formatString);
};
