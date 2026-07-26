// src/app/api/profile/route.ts
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { insertUserSchema } from "@/types/index";
import { requireActiveUser } from "@/lib/require-role";

export async function PUT(request: Request) {
	const authResult = await requireActiveUser();
	if (authResult.error) return authResult.error;

	try {
		const body = await request.json();
		const result = insertUserSchema.safeParse(body);

		if (!result.success) {
			return NextResponse.json(
				{ errors: result.error.message },
				{ status: 400 }
			);
		}

		// Always the caller's own row — never a client-supplied id.
		const updatedUser = await db
			.update(users)
			.set({
				firstName: result.data.firstName,
				lastName: result.data.lastName,
				middleName: result.data.middleName,
				contactNo: result.data.contactNo,
				email: result.data.email,
			})
			.where(eq(users.id, authResult.user.id))
			.returning();

		return NextResponse.json(updatedUser[0]);
	} catch (error) {
		console.error(error);
		return NextResponse.json(
			{ error: "Failed to update profile" },
			{ status: 500 }
		);
	}
}
