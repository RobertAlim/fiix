"use server";

import { db } from "@//db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { userProfileSchema } from "@/validation/userProfile";

export async function updateUserProfile(input: unknown) {
	const data = userProfileSchema.parse(input);

	// Only updatable fields:
	const payload = {
		firstName: data.firstName,
		lastName: data.lastName,
		middleName: data.middleName ?? null,
		contactNo: data.contactNo ?? null,
		birthday: data.birthday ? data.birthday : null,
		email: data.email,
	};

	const [updated] = await db
		.update(users)
		.set(payload)
		.where(eq(users.id, data.id))
		.returning();

	return updated;
}
