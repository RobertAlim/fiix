"use server";

import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Upserts a user by EMAIL, not by clerkId or by inserting unconditionally.
 *
 * Previously this always ran a bare INSERT. That's fine the very first time
 * someone signs up, but Fiix's sign-in is a custom OTP/"ticket" flow layered
 * on top of Clerk rather than Clerk's own persistent-account UI — logging in
 * again can mint a new Clerk user id for the same real person. Clerk then
 * fires `user.created` again with that new id but the SAME email, and the
 * old unconditional insert had zero deduplication (not even by clerkId),
 * so every login after a logout created a fresh row: a second technician
 * profile, a second set of role/isActive settings, and none of the
 * schedules/attendance history tied to the original row.
 *
 * The fix: look the person up by email first. If they already exist, update
 * their existing row's identity fields (clerkId — so future lookups resolve
 * to this row — and firstName/lastName, in case those changed) and stop.
 * Only insert when no row for that email exists yet. Business fields the
 * app itself manages (role, isActive, middleName, contactNo, birthday) are
 * deliberately left untouched on update — Clerk isn't the source of truth
 * for those, and clobbering them on every login would be its own bug.
 */
export default async function createUser(params: CreateUserParams) {
	const { clerkId, email, firstName, lastName } = params;

	try {
		const [existing] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.email, email))
			.limit(1);

		if (existing) {
			await db
				.update(users)
				.set({ clerkId, firstName, lastName })
				.where(eq(users.id, existing.id));

			return { success: true, updated: true };
		}

		try {
			await db.insert(users).values({
				clerkId,
				email,
				firstName,
				lastName,
				isActive: false,
			});
		} catch (insertError) {
			// Two `user.created` events for the same new signup can arrive
			// close enough together to both pass the SELECT above before
			// either INSERT commits — Clerk's webhooks are explicitly
			// documented as at-least-once delivery, so duplicate deliveries
			// are routine, not exceptional. The unique index on email (see
			// migration) turns the LOSING insert into a constraint violation
			// instead of a second row; fall back to the same update the
			// normal duplicate-email path takes, rather than surfacing that
			// violation as a failure.
			const [raceWinner] = await db
				.select({ id: users.id })
				.from(users)
				.where(eq(users.email, email))
				.limit(1);
			if (!raceWinner) throw insertError;

			await db
				.update(users)
				.set({ clerkId, firstName, lastName })
				.where(eq(users.id, raceWinner.id));
		}

		return { success: true, updated: false };
	} catch (error) {
		console.error("Error creating user:", error);

		return { success: false, error: error };
	}
}
