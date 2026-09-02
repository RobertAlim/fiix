// app/api/collections/route.ts
//
// GET  ?scheduleId= — EVERY collection record already saved for one
//      schedule, most recent first. A schedule/client can legitimately
//      have several (delayed check payments, multiple checks released
//      in one visit, etc.) — this is informational history for the
//      Collection modal to show alongside its (always-open) form, not a
//      "does one already exist" gate. See CollectionModal's own comment
//      on why the form is never disabled based on this.
// POST — creates a new collection record. Duplicate prevention is
//      TWO-LAYERED and scoped to ONE specific combination —
//      (clientId, month, year, amount) — NOT scheduleId: an
//      application-level pre-check here (fast, friendly error message)
//      AND the DB's own unique constraint on that same combination from
//      migration 0065/0066 (the actual guarantee under a race — two
//      Admins saving the same collection within the same request window
//      would both pass the pre-check, but only one INSERT can win).
//      A different year, month, or amount for the SAME schedule is a
//      different, legitimate collection and is never blocked.
//
// `amount` flows through as a plain decimal peso number end to end — no
// centavos conversion. db/schema.ts's `collections.amount` column is
// `numeric(12,2)` (exact decimal, not floating point), so there's no
// float-rounding reason left to convert to an integer at this boundary;
// see that column's own doc comment for the full history.
import { NextResponse } from "next/server";
import { db } from "@/db";
import { collections } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireRole } from "@/lib/require-role";
import { collectionCreateSchema } from "@/validation/collectionSchema";

export async function GET(req: Request) {
	const authResult = await requireRole(["Admin", "Scheduler"]);
	if (authResult.error) return authResult.error;

	const { searchParams } = new URL(req.url);
	const scheduleIdParam = searchParams.get("scheduleId");
	const scheduleId = Number(scheduleIdParam);
	if (!scheduleIdParam || !Number.isInteger(scheduleId) || scheduleId <= 0) {
		return NextResponse.json({ error: "Missing or invalid scheduleId" }, { status: 400 });
	}

	const rows = await db
		.select()
		.from(collections)
		.where(eq(collections.scheduleId, scheduleId))
		.orderBy(desc(collections.receivedAt), desc(collections.id));

	return NextResponse.json({
		data: rows.map((row) => ({
			id: row.id,
			clientId: row.clientId,
			supportServiceId: row.supportServiceId,
			scheduleId: row.scheduleId,
			year: row.year,
			month: row.month,
			// row.amount is already a JS number here — drizzle's
			// `mode: "number"` on the numeric() column (db/schema.ts)
			// handles the string→number conversion Postgres's numeric
			// type would otherwise need at this boundary.
			amount: row.amount,
			status: row.status,
			modeOfPayment: row.modeOfPayment,
			receivedAt: row.receivedAt,
			bankName: row.bankName,
			checkNo: row.checkNo,
			notes: row.notes,
		})),
	});
}

export async function POST(req: Request) {
	const authResult = await requireRole(["Admin", "Scheduler"]);
	if (authResult.error) return authResult.error;

	const body = await req.json();
	const parsed = collectionCreateSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json(parsed.error.format(), { status: 400 });
	}
	// data.amount already normalized to exactly 2 decimal places by the
	// schema's own .transform() — validation/collectionSchema.ts.
	const data = parsed.data;

	// Application-level pre-check — fast, friendly 409 for the common
	// case (no race). Not the actual guarantee; see this file's header
	// comment. Deliberately NOT scoped by scheduleId — the same
	// client/month/year/amount combination is a duplicate regardless of
	// which schedule it's attached to, and a DIFFERENT combination for
	// the SAME schedule is never a duplicate.
	const [existing] = await db
		.select({ id: collections.id })
		.from(collections)
		.where(
			and(
				eq(collections.clientId, data.clientId),
				eq(collections.month, data.month),
				eq(collections.year, data.year),
				eq(collections.amount, data.amount)
			)
		)
		.limit(1);
	if (existing) {
		return NextResponse.json(
			{
				error:
					"A collection for this client, month, year, and amount already exists.",
			},
			{ status: 409 }
		);
	}

	try {
		const [inserted] = await db
			.insert(collections)
			.values({
				clientId: data.clientId,
				supportServiceId: data.supportServiceId,
				scheduleId: data.scheduleId,
				year: data.year,
				month: data.month,
				amount: data.amount,
				status: data.status,
				modeOfPayment: data.modeOfPayment,
				receivedAt: data.receivedAt,
				bankName: data.bankName ?? null,
				checkNo: data.checkNo ?? null,
				notes: data.notes ?? null,
				createdBy: authResult.user.id,
			})
			.returning({ id: collections.id });

		return NextResponse.json({ id: inserted.id });
	} catch (err) {
		// Lost the pre-check race to a concurrent request — the DB's
		// unique constraint (migration 0065/0066) is what actually caught
		// it. Postgres error code 23505 = unique_violation; checked
		// narrowly so a genuinely unexpected DB error still surfaces as a
		// real 500 instead of being mislabeled as a duplicate.
		const isDuplicate =
			typeof err === "object" &&
			err !== null &&
			"code" in err &&
			(err as { code?: string }).code === "23505";
		if (isDuplicate) {
			return NextResponse.json(
				{
					error:
						"A collection for this client, month, year, and amount already exists.",
				},
				{ status: 409 }
			);
		}
		console.error("POST /api/collections failed:", err);
		return NextResponse.json({ error: "Failed to save collection." }, { status: 500 });
	}
}
