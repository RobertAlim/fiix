// app/api/user-status/route.ts
// Returns the ACTIVE status of the currently signed-in user only.
// Identity is derived from the Clerk session — never from a query
// parameter — so one user cannot look up another user's record (IDOR fix).
import { auth, currentUser } from "@clerk/nextjs/server";
import { getUserStatus } from "@/lib/user-status";
import createUser from "@/app/api/actions/user-action";
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
		//
		// Routed through the same createUser() the webhook uses (not a raw
		// insert here) so there's exactly one place that decides "new person
		// vs. same person, new Clerk id" — by email, not clerkId. This is
		// also why the plain insert this used to do is gone: Fiix's custom
		// OTP/ticket sign-in can issue a fresh Clerk user id for someone who
		// already has a row, and getUserStatus (clerkId-only) legitimately
		// finds nothing for that new id — this branch existing is not itself
		// the bug. A blind insert here duplicated that person before the
		// users.email unique constraint existed, and now correctly fails
		// against it instead — createUser's email lookup is what actually
		// resolves that back to their existing row.
		const clerkUser = await currentUser();

		if (clerkUser) {
			const email =
				clerkUser.emailAddresses.find(
					(e) => e.id === clerkUser.primaryEmailAddressId
				)?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;

			if (email) {
				const result = await createUser({
					clerkId: userId,
					email,
					firstName: clerkUser.firstName ?? "",
					lastName: clerkUser.lastName ?? "",
					isActive: false,
				});
				if (!result.success) {
					console.error("Auto-provision failed:", result.error);
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
