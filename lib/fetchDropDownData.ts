// lib/fetchDropdownData.ts
import { db } from "@/db"; // your drizzle client
import { parts, status } from "@/db/schema";
import { sql } from "drizzle-orm";

export async function getParts() {
	// try {
	const partsData = await db
		.select({
			value: sql<string>`CAST(${parts.id} AS TEXT)`,
			label: parts.name,
		})
		.from(parts);

	return partsData;
	// } catch (error) {
	// 	console.error("Error creating user:", error);

	// 	return { success: false, error: error };
	// }
}

export async function getStatus() {
	// try {
	const statusData = await db
		.select({
			value: sql<string>`CAST(${status.id} AS TEXT)`,
			label: status.name,
		})
		.from(status);

	return statusData;
	// } catch (error) {
	// 	console.error("Error creating user:", error);

	// 	return { success: false, error: error };
	// }
}
