// app/api/printer-history/route.ts
//
// The route the Fiix Technician mobile app was ALREADY calling
// (GET /api/printer-history?serialNo=) — it never existed server-side,
// which is why it 404'd. This is the fix: a serialNo-keyed sibling of the
// existing Admin-only, id-keyed
// app/api/admin/master/printers/[id]/history/route.ts.
//
// Deliberately a SEPARATE route rather than opening the existing one to
// Technician + accepting a serialNo there too:
//   - The existing route is scoped under app/api/admin/master/... and
//     gated `requireRole(["Admin"])` specifically because it backs an
//     Admin-only page (components/pages/Printers.tsx). Widening its role
//     check risks that page's own access assumptions; a technician mobile
//     client hitting an "admin/master" path at all is also just
//     conceptually wrong.
//   - serialNo is what every mobile lookup in this app is keyed by (QR
//     codes encode serial numbers, not database ids — see GET /api/maintain
//     using the same convention) — the mobile app was never going to have
//     a printer's numeric id in hand without an extra round trip.
//
// The QUERY LOGIC below is copied from that existing route almost verbatim
// — same joins, same "history spans every deployment, not just the active
// one" reasoning, same Services-list construction — specifically so the two
// stay in lockstep. If one changes, check the other.
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
import { formatPhDateTime } from "@/lib/formatDate";

export async function GET(req: Request) {
	const auth = await requireRole(["Admin", "Technician"]);
	if (auth.error) return auth.error;

	const { searchParams } = new URL(req.url);
	const serialNo = searchParams.get("serialNo");
	if (!serialNo) {
		return NextResponse.json({ error: "Missing serialNo" }, { status: 400 });
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
		.where(eq(printers.serialNo, serialNo))
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
		.where(and(eq(deployments.printerId, printer.id), isNotNull(maintain.printCount)))
		.orderBy(desc(maintain.createdAt))
		.limit(1);

	const historyRows = await db
		.select({
			id: maintain.id,
			technician: users.firstName,
			technicianLastName: users.lastName,
			status: status.name,
			notes: maintain.notes,
			cleanPrinter: maintain.cleanPrinter,
			cleanWasteTank: maintain.cleanWasteTank,
			createdAt: maintain.createdAt,
			// Client/location as of THIS report, not the printer's current
			// one — read off the same deployment row maintain.deploymentId
			// already points to. A transfer opens a NEW deployment row
			// rather than editing the old one in place, so a report filed
			// before a transfer keeps showing the site the printer was
			// actually at when the technician visited.
			client: clients.name,
			location: locations.name,
		})
		.from(maintain)
		.innerJoin(deployments, eq(maintain.deploymentId, deployments.id))
		.innerJoin(users, eq(users.id, maintain.userId))
		.innerJoin(status, eq(status.id, maintain.statusId))
		.leftJoin(clients, eq(clients.id, deployments.clientId))
		.leftJoin(locations, eq(locations.id, deployments.locationId))
		.where(eq(deployments.printerId, printer.id))
		.orderBy(desc(maintain.createdAt));

	// Replacement/Repair parts, batched across every report on this
	// printer rather than one query per row (N+1) — then grouped in JS.
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
		const services: string[] = [];
		if (r.cleanPrinter) services.push("Cleaning of Printer");
		if (r.cleanWasteTank) services.push("Cleaning of Waste Tank");
		services.push(...(partsByMaintainId.get(r.id) ?? []));

		return {
			id: r.id,
			technician: `${r.technician} ${r.technicianLastName}`,
			status: r.status,
			notes: r.notes,
			replacementRepair: services.join(", ") || null,
			// Pre-formatted server-side, Manila-anchored — NOT the raw ISO
			// instant. This project has hit the UTC-vs-Manila class of bug
			// before (see lib/formatDate.ts's own history / the Reports
			// module); the mobile app has no equivalent formatter, so
			// formatting happens here once, the same way the web dialog's
			// h.createdAt is formatted at render time via this exact
			// function — just moved server-side so a phone in any
			// timezone still shows the correct Manila time.
			date: formatPhDateTime(r.createdAt),
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
