"use server";

import { db } from "@/db";
import { users } from "@/db/schema";

export default async function createUser(params: CreateUserParams) {
	const {
		clerkId,
		email,
		firstName,
		lastName,
		contactNo,
		birthday,
		role,
		isActive,
	} = params;
	console.log("Create User Functions");
	try {
		await db.insert(users).values({
			clerkId,
			email,
			firstName,
			lastName,
			contactNo,
			birthday, // make sure birthday is provided in CreateUserParams
			role,
			isActive,
		});

		return { success: true };
	} catch (error) {
		console.error("Error creating user:", error);

		return { success: false, error: error };
	}
}
