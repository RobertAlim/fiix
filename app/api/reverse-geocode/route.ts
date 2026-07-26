import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveUser } from "@/lib/require-role";
import { reverseGeocodeServer } from "@/lib/geocoder";

const querySchema = z.object({
	lat: z.coerce.number().min(-90).max(90),
	lng: z.coerce.number().min(-180).max(180),
});

/**
 * GET /api/reverse-geocode?lat=..&lng=..
 * Resolves coordinates into a readable address for the offline-first save
 * pipeline. Auth-gated so the geocoding proxy can't be used anonymously.
 */
export async function GET(req: NextRequest) {
	const authResult = await requireActiveUser();
	if (authResult.error) return authResult.error;

	const parsed = querySchema.safeParse({
		lat: req.nextUrl.searchParams.get("lat"),
		lng: req.nextUrl.searchParams.get("lng"),
	});
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "Invalid coordinates" },
			{ status: 400 }
		);
	}

	const result = await reverseGeocodeServer(parsed.data.lat, parsed.data.lng);
	if (!result) {
		return NextResponse.json(
			{ error: "Reverse geocoding unavailable" },
			{ status: 502 }
		);
	}
	return NextResponse.json(result);
}
