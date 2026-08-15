// app/api/signatories/route.ts
import { NextRequest, NextResponse } from "next/server"; // Adjust this path to your Drizzle client setup
import { db } from "@/db";
import { signatories } from "@/db/schema"; // Adjust this path to your Drizzle schema
import { ensureError } from "@/lib/errors";
import { toProperCase } from "@/lib/stringUtils";
import { requireRole } from "@/lib/require-role";
import { and, eq, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
	const authResult = await requireRole(["Admin", "Technician", "Scheduler"]);
	if (authResult.error) return authResult.error;

	const url = new URL(req.url);
	const clientIdParam = url.searchParams.get("clientId");
	const clientId = Number(clientIdParam);
	if (!clientIdParam || !Number.isInteger(clientId) || clientId <= 0) {
		return NextResponse.json({ error: "Invalid clientId." }, { status: 400 });
	}

	// locationId is optional for backward compatibility with any existing
	// caller that only ever passed clientId — when present (the mobile
	// Maintenance form always passes it, since it always has a specific
	// location in hand), results are scoped to that exact client+location
	// pair, per the "same client can have signatories for different
	// locations" requirement. Client-only signatories (locationId IS NULL
	// in the DB — the pre-existing rows from before this column existed)
	// are included regardless of the requested location, so older data
	// doesn't just disappear from every location's list.
	const locationIdParam = url.searchParams.get("locationId");
	const locationId = locationIdParam ? Number(locationIdParam) : null;

	const rows = await db
		.select({
			id: signatories.id,
			firstName: signatories.firstName,
			lastName: signatories.lastName,
		})
		.from(signatories)
		.where(
			locationId != null
				? and(
						eq(signatories.clientId, clientId),
						sql`(${signatories.locationId} = ${locationId} OR ${signatories.locationId} IS NULL)`
				  )
				: eq(signatories.clientId, clientId)
		);

	return NextResponse.json(
		rows.map((s) => ({ value: String(s.id), label: `${s.firstName} ${s.lastName}` }))
	);
}

export async function POST(req: NextRequest) {
	const authResult = await requireRole(["Admin", "Technician"]);
	if (authResult.error) return authResult.error;

	try {
		const signatory = await req.json();

		const { clientId, locationId, firstName, lastName } = signatory;
		const properFirstName = toProperCase(firstName);
		const properLastName = toProperCase(lastName);
		const clientIdValue = clientId != null ? Number(clientId) : null;
		const locationIdValue = locationId != null ? Number(locationId) : null;

		// There is no unique constraint on (firstName, lastName, clientId,
		// locationId) in the database — this table allows client-less (and
		// now location-less) signatories, and NULL isn't something a unique
		// constraint can dedupe against anyway (SQL treats every NULL as
		// distinct from every other NULL). So duplicate prevention is done
		// explicitly here instead of via ON CONFLICT, the same approach the
		// signatories CSV importer already uses. `IS NOT DISTINCT FROM`
		// (rather than `=`) is what makes two signatories that are both
		// missing a location (or both missing a client) correctly count as
		// a duplicate of each other rather than SQL's usual "NULL != NULL"
		// behavior silently letting duplicates through.
		//
		// Scope explicitly widened to include locationId per the "prevent
		// duplicate signatories only when BOTH Client and Location match"
		// requirement — same name at the same client but a DIFFERENT
		// location is a legitimate, distinct signatory, not a duplicate.
		const [existing] = await db
			.select({ id: signatories.id })
			.from(signatories)
			.where(
				and(
					eq(signatories.firstName, properFirstName),
					eq(signatories.lastName, properLastName),
					sql`${signatories.clientId} IS NOT DISTINCT FROM ${clientIdValue}`,
					sql`${signatories.locationId} IS NOT DISTINCT FROM ${locationIdValue}`
				)
			)
			.limit(1);

		if (existing) {
			return NextResponse.json(
				{ message: "This signatory already exists for this client and location." },
				{ status: 409 }
			);
		}

		const [{ id: newId }] = await db
			.insert(signatories)
			.values({
				firstName: properFirstName,
				lastName: properLastName,
				clientId: clientIdValue,
				locationId: locationIdValue,
			})
			.returning({ id: signatories.id });

		// id included specifically for the mobile app's "add signatory"
		// flow, which needs to auto-select the newly created signatory
		// immediately without a second round trip or fragile name-matching
		// against a refetched list.
		return NextResponse.json(
			{
				message: "New signatory created successfully.",
				id: newId,
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
