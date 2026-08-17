// app/api/admin/master/printers/[id]/transfer/route.ts
//
// Moves a printer to a different client/location.
//
// WHY THIS IS A SEPARATE ROUTE FROM PATCH /api/admin/master/printers/[id]
// -----------------------------------------------------------------------
// The generic PATCH updates the printer's ACTIVE deployment row in place.
// That's fine for correcting a typo, but it's wrong for a transfer: every
// historical `maintain` row points at a deploymentId, and the report/PDF
// queries read the client, location and department by joining through it.
// Editing that row in place therefore silently rewrites the client name on
// every maintenance report the printer has ever had — a report printed
// last year would start showing the new client.
//
// A transfer instead retires the current deployment (deployedHere = false)
// and opens a new one. Past maintenance stays attached to the old row and
// keeps reporting where the work actually happened, while everything that
// asks "where is this printer now" filters on deployedHere = true and sees
// the new row. That flag exists in the schema precisely for this.
//
// `printers.deployedClient` is never touched — it is the printer's
// original/first client and is meant to survive every later transfer.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/require-role";
import { db } from "@/db";
import { printers, deployments, clients, locations } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { phTodayDateString } from "@/lib/attendance";

// Three actions live behind this one route because they're all "the
// Transfer Printer dialog": relocating to a known new client/location, or
// tagging the unit as Missing/Found when its location ISN'T known. See
// components/PrinterTransferDialog.tsx and printers.status's doc comment
// in db/schema.ts — "Missing" means specifically "not physically found at
// its recorded location, but still exists in the system", and is only ever
// set or cleared from here.
const bodySchema = z.discriminatedUnion("action", [
	z.object({
		action: z.literal("transfer"),
		clientId: z.number().int().positive(),
		locationId: z.number().int().positive(),
	}),
	z.object({ action: z.literal("markMissing") }),
	z.object({ action: z.literal("markFound") }),
]);

function parseId(id: string) {
	const n = Number(id);
	return Number.isInteger(n) && n > 0 ? n : null;
}

export async function POST(
	req: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	const auth = await requireRole(["Admin"]);
	if (auth.error) return auth.error;

	const id = parseId((await params).id);
	if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

	const parsed = bodySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json(
			{ error: parsed.error.issues[0]?.message ?? "Invalid input." },
			{ status: 400 }
		);
	}
	const { action } = parsed.data;

	try {
		const [printer] = await db
			.select({ id: printers.id, serialNo: printers.serialNo, status: printers.status })
			.from(printers)
			.where(eq(printers.id, id))
			.limit(1);
		if (!printer) {
			return NextResponse.json({ error: "Printer not found." }, { status: 404 });
		}

		// --- Mark Missing / Mark Found -------------------------------------
		// Neither touches deployments — Missing means "we don't know where
		// it is right now", not "it moved". The last known client/location
		// stays exactly as recorded until either a real transfer happens or
		// it's found back where it already was (markFound).
		if (action === "markMissing") {
			if (printer.status === "Missing") {
				return NextResponse.json(
					{ error: "This printer is already marked Missing." },
					{ status: 409 }
				);
			}
			await db.update(printers).set({ status: "Missing" }).where(eq(printers.id, id));
			return NextResponse.json({ success: true, status: "Missing", serialNo: printer.serialNo });
		}

		if (action === "markFound") {
			if (printer.status !== "Missing") {
				return NextResponse.json(
					{ error: "This printer is not currently marked Missing." },
					{ status: 409 }
				);
			}
			await db.update(printers).set({ status: "Active" }).where(eq(printers.id, id));
			return NextResponse.json({ success: true, status: "Active", serialNo: printer.serialNo });
		}

		// --- Transfer --------------------------------------------------------
		const { clientId, locationId } = parsed.data;

		const [[client], [location]] = await Promise.all([
			db
				.select({ id: clients.id, name: clients.name })
				.from(clients)
				.where(eq(clients.id, clientId))
				.limit(1),
			db
				.select({
					id: locations.id,
					name: locations.name,
					clientId: locations.clientId,
				})
				.from(locations)
				.where(eq(locations.id, locationId))
				.limit(1),
		]);

		if (!client) {
			return NextResponse.json(
				{ error: "Selected client does not exist." },
				{ status: 400 }
			);
		}
		if (!location) {
			return NextResponse.json(
				{ error: "Selected location does not exist." },
				{ status: 400 }
			);
		}
		// Locations belong to exactly one client in this schema, so a
		// mismatched pair would produce a deployment that reports one client
		// but sits at another's site — checked here rather than trusted from
		// the client, which only filters the dropdown.
		if (location.clientId !== clientId) {
			return NextResponse.json(
				{
					error: `"${location.name}" does not belong to ${client.name}. Pick a location under the selected client.`,
				},
				{ status: 400 }
			);
		}

		const [current] = await db
			.select({
				id: deployments.id,
				modelId: deployments.modelId,
				clientId: deployments.clientId,
				locationId: deployments.locationId,
				departmentId: deployments.departmentId,
			})
			.from(deployments)
			.where(and(eq(deployments.printerId, id), eq(deployments.deployedHere, true)))
			.limit(1);

		if (!current) {
			return NextResponse.json(
				{
					error:
						"This printer has no active deployment to transfer. Edit it first to set its current client, location, model and department.",
				},
				{ status: 409 }
			);
		}

		if (current.clientId === clientId && current.locationId === locationId) {
			return NextResponse.json(
				{ error: "The printer is already at this client and location." },
				{ status: 409 }
			);
		}

		// Retire the old deployment BEFORE opening the new one. Ordered this
		// way on purpose: neon-http has no real transaction, so if the second
		// statement fails the printer is left with zero active deployments —
		// visible and fixable — rather than two, which would duplicate the
		// printer in every grid that joins on deployedHere = true.
		await db
			.update(deployments)
			.set({ deployedHere: false })
			.where(eq(deployments.id, current.id));

		const [created] = await db
			.insert(deployments)
			.values({
				printerId: id,
				// Model and department carry over — a transfer moves the same
				// physical unit; only where it sits changes.
				modelId: current.modelId,
				departmentId: current.departmentId,
				clientId,
				locationId,
				// The date the unit landed at its new site, in Manila.
				deploymentDate: phTodayDateString(),
				deployedHere: true,
			})
			.returning({ id: deployments.id });

		// A transfer means the unit was physically located and moved — if it
		// had been flagged Missing, that's resolved by this action, same as
		// an explicit markFound would do.
		if (printer.status === "Missing") {
			await db.update(printers).set({ status: "Active" }).where(eq(printers.id, id));
		}

		return NextResponse.json({
			success: true,
			deploymentId: created?.id,
			serialNo: printer.serialNo,
			clientName: client.name,
			locationName: location.name,
		});
	} catch (err) {
		console.error("printer transfer failed:", err);
		const message = err instanceof Error ? err.message : String(err);
		// Same self-diagnosing pattern used by the Purge Maintenance route:
		// a missing column/relation means migrations are behind, which is
		// otherwise indistinguishable from a generic 500 without log access.
		if (/does not exist/i.test(message)) {
			return NextResponse.json(
				{
					error:
						"The database schema is out of date for this operation. Run `npm run db:migrate` against this environment and try again.",
				},
				{ status: 500 }
			);
		}
		return NextResponse.json(
			{ error: "Could not transfer the printer. Please try again." },
			{ status: 500 }
		);
	}
}
