// app/api/user-status/route.ts
// Returns the ACTIVE status of the currently signed-in user only.
// Identity is derived from the Clerk session — never from a query
// parameter — so one user cannot look up another user's record (IDOR fix).
import { auth, currentUser } from "@clerk/nextjs/server";
import { getUserStatus } from "@/lib/user-status";
import { db } from "@/db";
import { users } from "@/db/schema";
import { NextResponse } from "next/server";

export async function GET() {
	const { userId } = await auth();

	if (!userId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	let user = await getUserStatus(userId);

	if (!user[0]) {
		// Self-heal: normally the Clerk "user.created" webhook provisions this
		// row. If it hasn't arrived yet — unreachable in local dev without a
		// tunnel, a delivery failure, a race on first login — provision the
		// row here from the live Clerk session instead of leaving the user
		// stuck with no DB record and no way to proceed past the landing page.
		const clerkUser = await currentUser();

		if (clerkUser) {
			const email =
				clerkUser.emailAddresses.find(
					(e) => e.id === clerkUser.primaryEmailAddressId
				)?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;

			if (email) {
				try {
					await db.insert(users).values({
						clerkId: userId,
						email,
						firstName: clerkUser.firstName ?? "",
						lastName: clerkUser.lastName ?? "",
						isActive: false,
					});
				} catch (err) {
					// Most likely a concurrent request already inserted this row
					// (no unique constraint on clerkId yet — see AUDIT.md Tier 2).
					console.error("Auto-provision insert failed:", err);
				}
				user = await getUserStatus(userId);
			}
		}
	}

	if (!user[0]) {
		return NextResponse.json({ error: "User not found" }, { status: 404 });
	}

	return NextResponse.json(user[0]);
}
