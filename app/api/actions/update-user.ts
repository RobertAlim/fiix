"use server";

import { db } from "@//db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { userProfileSchema } from "@/validation/userProfile";
import { auth } from "@clerk/nextjs/server";

export async function updateUserProfile(input: unknown) {
	const { userId } = await auth();
	if (!userId) {
		throw new Error("Unauthorized");
	}

	const data = userProfileSchema.parse(input);

	// The client supplies `id` for form-state reasons, but the row that gets
	// updated is always resolved from the caller's own Clerk session — never
	// trust the client-supplied id, or any signed-in user could edit any
	// other user's profile by guessing their numeric id.
	const [caller] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.clerkId, userId))
		.limit(1);

	if (!caller || caller.id !== data.id) {
		throw new Error("Forbidden");
	}

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
		.where(eq(users.id, caller.id))
		.returning();

	return updated;
}
