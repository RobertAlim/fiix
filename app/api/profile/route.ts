// src/app/api/profile/route.ts
import { db } from "@/db"; // Your Drizzle DB connection
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { insertUserSchema } from "@/types/index";

export async function PUT(request: Request) {
	try {
		const body = await request.json();
		const result = insertUserSchema.safeParse(body);

		if (!result.success) {
			return NextResponse.json(
				{ errors: result.error.message },
				{ status: 400 }
			);
		}

		// In a real app, you would get the user ID from the session or auth context
		const userId = 1; // Example user ID

		const updatedUser = await db
			.update(users)
			.set({
				firstName: result.data.firstName,
				lastName: result.data.lastName,
				middleName: result.data.middleName,
				contactNo: result.data.contactNo,
				email: result.data.email,
			})
			.where(eq(users.id, userId))
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
