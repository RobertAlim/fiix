import { sql } from "drizzle-orm";
import { db } from "@/db"; // your drizzle client

/**
 * Get current Philippine date/time formatted as MM/dd/yyyy hh:mm:ss AM/PM
 */
export async function getPHTime(): Promise<string> {
	const result = await db.execute(
		sql`SELECT NOW() AT TIME ZONE 'Asia/Manila' AS current_time_ph`
	);

	// Explicit cast to string so TS knows it's valid for new Date()
	const dateString = result.rows[0].current_time_ph as string;
	const currentDatePH = new Date(dateString);

	const formattedDate = currentDatePH.toLocaleString("en-US", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: true,
	});

	return formattedDate.replace(",", "");
}
