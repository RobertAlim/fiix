"use server";

import { db } from "@/db";
import { users } from "@/db/schema";

export default async function createUser(params: CreateUserParams) {
	const { clerkId, email, firstName, lastName } = params;

	try {
		await db.insert(users).values({
			clerkId: clerkId,
			email: email,
			firstName: firstName,
			lastName: lastName,
		});

		return { success: true };
	} catch (error) {
		console.error("Error creating user:", error);

		return { success: false, error: error };
	}
}
