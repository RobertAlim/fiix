// app/api/signatories/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db"; // Adjust this path to your Drizzle client setup
import { signatories } from "@/db/schema"; // Adjust this path to your Drizzle schema
import { ensureError } from "@/lib/errors";
import { toProperCase } from "@/lib/stringUtils";
import { requireRole } from "@/lib/require-role";
import { and, eq, sql } from "drizzle-orm";

export async function POST(req: NextRequest) {
	const authResult = await requireRole(["Admin", "Technician"]);
	if (authResult.error) return authResult.error;

	try {
		const signatory = await req.json();

		const { clientId, firstName, lastName } = signatory;
		const properFirstName = toProperCase(firstName);
		const properLastName = toProperCase(lastName);
		const clientIdValue = clientId != null ? Number(clientId) : null;

		// There is no unique constraint on (firstName, lastName, clientId) in
		// the database — this table allows client-less signatories, and a
		// clientId of NULL isn't something a unique constraint can dedupe
		// against anyway (SQL treats every NULL as distinct from every other
		// NULL). So duplicate prevention is done explicitly here instead of
		// via ON CONFLICT, the same approach the signatories CSV importer
		// already uses. `IS NOT DISTINCT FROM` (rather than `=`) is what
		// makes two client-less signatories with the same name correctly
		// count as a duplicate of each other.
		const [existing] = await db
			.select({ id: signatories.id })
			.from(signatories)
			.where(
				and(
					eq(signatories.firstName, properFirstName),
					eq(signatories.lastName, properLastName),
					sql`${signatories.clientId} IS NOT DISTINCT FROM ${clientIdValue}`
				)
			)
			.limit(1);

		if (existing) {
			return NextResponse.json(
				{ message: "This signatory already exists for this client." },
				{ status: 409 }
			);
		}

		await db.insert(signatories).values({
			firstName: properFirstName,
			lastName: properLastName,
			clientId: clientIdValue,
		});

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

