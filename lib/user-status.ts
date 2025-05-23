// lib/user-status.ts
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function getUserStatus(userId: string) {
	const user = await db
		.select()
		.from(users)
		.where(eq(users.clerkId, userId))
		.limit(1);

	return user ?? null;
}
