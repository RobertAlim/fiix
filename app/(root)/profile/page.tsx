import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ProfileForm } from "@/components/profile/profile-form";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { BackButton } from "@/components/ui/back-button";

export default async function ProfilePage() {
	const clerkUser = await currentUser();
	if (!clerkUser) redirect("/sign-in");

	// Match on email; adjust if you map by a different key
	const email = clerkUser.emailAddresses?.[0]?.emailAddress;
	if (!email) redirect("/");

	const row = await db
		.select()
		.from(users)
		.where(eq(users.email, email))
		.limit(1);
	const me = row[0];

	if (!me) {
		// You can redirect to onboarding or show a friendly message
		return (
			<div className="max-w-2xl">
				<h2 className="text-xl font-semibold">No profile record</h2>
				<p className="text-muted-foreground">
					Ask an admin to create your user record for {email}.
				</p>
			</div>
		);
	}

	return (
		<div className="flex h-screen items-center justify-center p-4 md:p-8">
			<div className="flex flex-col gap-6">
				<div>
					<BackButton />
				</div>

				<ProfileForm user={me} />
			</div>
		</div>
	);
}
