// utils/dateConverter.ts
import { formatInTimeZone } from "date-fns-tz";

/**
 * Converts a date to the Philippine timezone and formats it.
 * This is useful for consistently displaying and saving dates.
 * @param date - The date object or ISO string to convert.
 * @param formatString - The desired output format for the date.
 * @returns The formatted date string in the Philippine timezone.
 */
export const convertToPhilippineTimezone = (
	date: Date | string,
	formatString: string = "MM/dd/yyyy"
): string => {
	// Specify the timezone for the Philippines (Asia/Manila)
	const philippineTimezone = "Asia/Manila";

	// Format the date directly in the specified timezone
	return formatInTimeZone(date, philippineTimezone, formatString);
};
