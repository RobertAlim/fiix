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
			contactNo: "09498858466",
			birthday: "07/12/1984",
			role: "Administrator",
			isActive: false,
		});

		return { success: true };
	} catch (error) {
		console.error("Error creating user:", error);

		return { success: false, error: error };
	}
}
