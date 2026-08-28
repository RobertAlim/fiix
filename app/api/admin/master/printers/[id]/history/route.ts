// app/api/admin/master/printers/[id]/history/route.ts
//
// Backs the Printers grid's row-click history modal. Two logically
// separate pieces, both scoped to one printer:
//   - `printer`: CURRENT info (serial, model, client, print count) — model
//     and client come from the active deployment (deployedHere: true),
//     the same pattern the printers list route already uses, so "current"
//     always means the same thing everywhere in this module.
//   - `history`: every maintenance report ever filed against this printer,
//     across every deployment it's ever had (not just the active one) —
//     "complete history" per the request, so a transferred printer's past
//     visits at its old site are still visible here. The "Services"
//     section on the Maintenance Report form (see components/pages/
//     Maintenance.tsx) has four checkable items — Cleaning of Printer,
//     Cleaning of Waste Tank, Replacement, Repair — and this route's
//     `replacementRepair` field combines whichever of all four were
//     checked on each report into one list, exactly like the "Services"
//     array this app's own PDF report (app/api/pdf/route.tsx) already
//     builds from `maintain.cleanPrinter`/`cleanWasteTank` plus the
//     `replace`/`repair` join tables.
import { NextResponse } from "next/server";
import { db } from "@/db";
import {
	printers,
	deployments,
	clients,
	locations,
	models,
	maintain,
	status,
	users,
	replace,
	repair,
	parts,
} from "@/db/schema";
import { eq, and, desc, inArray, isNotNull } from "drizzle-orm";
import { requireRole } from "@/lib/require-role";

function parseId(id: string) {
	const n = Number(id);
	return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ id: string }> }
) {
	// Matches the rest of the Printers module (app/api/admin/master/
	// printers/route.ts) — Scheduler has no access to Printers at all
	// (see lib/permissions.ts's MODULE_ACCESS.Scheduler), so this stays
	// Admin-only; Super Admin passes via role implication.
	const auth = await requireRole(["Admin"]);
	if (auth.error) return auth.error;

	const printerId = parseId((await params).id);
	if (!printerId) {
		return NextResponse.json({ error: "Invalid id." }, { status: 400 });
	}

	const [printer] = await db
		.select({
			id: printers.id,
			serialNo: printers.serialNo,
			model: models.name,
			client: clients.name,
			status: printers.status,
		})
		.from(printers)
		.leftJoin(
			deployments,
			and(eq(deployments.printerId, printers.id), eq(deployments.deployedHere, true))
		)
		.leftJoin(models, eq(models.id, deployments.modelId))
		.leftJoin(clients, eq(clients.id, deployments.clientId))
		.where(eq(printers.id, printerId))
		.limit(1);

	if (!printer) {
		return NextResponse.json({ error: "Printer not found." }, { status: 404 });
	}

	// Most recent non-null printCount for this printer, across every
	// deployment it's had — same "latest recorded value" reasoning as
	// printCount's own doc comment in db/schema.ts.
	const [printCountRow] = await db
		.select({ printCount: maintain.printCount })
		.from(maintain)
		.innerJoin(deployments, eq(maintain.deploymentId, deployments.id))
		.where(
			and(eq(deployments.printerId, printerId), isNotNull(maintain.printCount))
		)
		.orderBy(desc(maintain.createdAt))
		.limit(1);

	const historyRows = await db
		.select({
			id: maintain.id,
			technician: users.firstName,
			technicianLastName: users.lastName,
			status: status.name,
			notes: maintain.notes,
			// The other two Services checkboxes — see the doc comment above.
			cleanPrinter: maintain.cleanPrinter,
			cleanWasteTank: maintain.cleanWasteTank,
			createdAt: maintain.createdAt,
			// Client/location as of THIS report, not the printer's current
			// one — read off the same deployment row `maintain.deploymentId`
			// already points to (the join below), same as app/api/
			// maintenance-history/route.ts and per the same reasoning as the
			// `printer` block's doc comment above: a transfer opens a NEW
			// deployment row rather than editing the old one in place, so a
			// report filed before a transfer keeps showing the site the
			// printer was actually at when the technician visited.
			client: clients.name,
			location: locations.name,
		})
		.from(maintain)
		.innerJoin(deployments, eq(maintain.deploymentId, deployments.id))
		.innerJoin(users, eq(users.id, maintain.userId))
		.innerJoin(status, eq(status.id, maintain.statusId))
		.leftJoin(clients, eq(clients.id, deployments.clientId))
		.leftJoin(locations, eq(locations.id, deployments.locationId))
		.where(eq(deployments.printerId, printerId))
		.orderBy(desc(maintain.createdAt));

	// Replacement/Repair parts, batched across every report on this
	// printer rather than one query per row (N+1) — then grouped in JS by
	// maintain id below.
	const maintainIds = historyRows.map((r) => r.id);
	const [replacedParts, repairedParts] = maintainIds.length
		? await Promise.all([
				db
					.select({ mtId: replace.mtId, partName: parts.name })
					.from(replace)
					.innerJoin(parts, eq(parts.id, replace.partId))
					.where(inArray(replace.mtId, maintainIds)),
				db
					.select({ mtId: repair.mtId, partName: parts.name })
					.from(repair)
					.innerJoin(parts, eq(parts.id, repair.partId))
					.where(inArray(repair.mtId, maintainIds)),
		  ])
		: [[], []];

	const partsByMaintainId = new Map<number, string[]>();
	for (const r of replacedParts) {
		const list = partsByMaintainId.get(r.mtId) ?? [];
		list.push(`${r.partName} (Replace)`);
		partsByMaintainId.set(r.mtId, list);
	}
	for (const r of repairedParts) {
		const list = partsByMaintainId.get(r.mtId) ?? [];
		list.push(`${r.partName} (Repair)`);
		partsByMaintainId.set(r.mtId, list);
	}

	const history = historyRows.map((r) => {
		// Full "Services" list for this report, in the same order the
		// checkboxes appear on the form: the two cleaning services first,
		// then whichever parts were marked for replacement or repair.
		const services: string[] = [];
		if (r.cleanPrinter) services.push("Cleaning of Printer");
		if (r.cleanWasteTank) services.push("Cleaning of Waste Tank");
		services.push(...(partsByMaintainId.get(r.id) ?? []));

		return {
			id: r.id,
			technician: `${r.technician} ${r.technicianLastName}`,
			status: r.status,
			notes: r.notes,
			// Comma-separated per the request; "—" when no Services item was
			// checked on this visit at all.
			replacementRepair: services.join(", ") || null,
			createdAt: r.createdAt,
			// Historical client/location — see the select above.
			client: r.client,
			location: r.location,
		};
	});

	return NextResponse.json({
		printer: {
			id: printer.id,
			serialNo: printer.serialNo,
			model: printer.model,
			client: printer.client,
			status: printer.status,
			printCount: printCountRow?.printCount ?? null,
		},
		history,
	});
}
