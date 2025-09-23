// app/api/signatories/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db"; // Adjust this path to your Drizzle client setup
import { signatories } from "@/db/schema"; // Adjust this path to your Drizzle schema
import { ensureError } from "@/lib/errors";
import { toProperCase } from "@/lib/stringUtils";

export async function POST(req: NextRequest) {
	try {
		const signatory = await req.json();

		const { clientId, firstName, lastName } = signatory;

		await db
			.insert(signatories)
			.values({
				firstName: toProperCase(firstName),
				lastName: toProperCase(lastName),
				clientId: Number(clientId),
			})
			.onConflictDoNothing({
				target: [signatories.firstName, signatories.lastName],
			})
			.returning({ id: signatories.id }); // Get the ID of the newly inserted schedule

		// If both inserts succeed, return success
		return NextResponse.json(
			{
				message: "New signatory created successfully.",
			},
			{ status: 201 }
		);
	} catch (error: unknown) {
		const err = ensureError(error);
		console.error("Error saving signatory:", err.message);

		// More specific error handling could be added here,
		// e.g., checking for unique constraint violations if you had them.
		return NextResponse.json(
			{ message: err.message || "Internal server error." },
			{ status: 500 }
		);
	}
}
