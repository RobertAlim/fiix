// app/api/related-issues/route.ts
//
// Backs the Related Issues nav page (components/pages/RelatedIssues.tsx):
// free-text search over `maintain.notes`, so a Scheduler/Admin can find
// every past report that mentions a symptom, part, or phrase — e.g.
// searching "gear" surfaces every printer ever noted as having a gear
// problem, not just the ones currently in Pending Maintenance.
//
// Same role gate as Pending Maintenance (app/api/pending-maintenance/
// route.ts) — this is the same audience looking at the same underlying
// data from a different angle (full-text history vs. "what's outstanding
// right now"), so access should track that module exactly. See
// lib/permissions.ts's ModuleKey/MODULE_ACCESS for the matching nav entry.
import { db } from "@/db";
import {
	maintain,
	deployments,
	printers,
	models,
	clients,
} from "@/db/schema";
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/require-role";

// Caps how many rows a single (possibly very common) keyword can return —
// this is a "find the report I'm thinking of" tool, not a bulk export.
// Results are already ordered newest-first, so the cap only ever drops the
// oldest, least-likely-relevant matches.
const MAX_RESULTS = 100;

export async function GET(req: Request) {
	const authResult = await requireRole(["Admin", "Scheduler"]);
	if (authResult.error) return authResult.error;

	const { searchParams } = new URL(req.url);
	const keyword = (searchParams.get("keyword") ?? "").trim();

	if (!keyword) {
		return NextResponse.json({ results: [] });
	}

	// Client/model as of THIS specific report, not the printer's current
	// deployment — same historical-correctness reasoning as
	// app/api/maintenance-history/route.ts and app/api/admin/master/
	// printers/[id]/history/route.ts: `maintain.deploymentId` points at the
	// exact deployment active when the report was filed, and a later
	// Printer Transfer opens a new deployment row rather than editing this
	// one, so an older report keeps showing where the printer actually was.
	const rows = await db
		.select({
			id: maintain.id,
			printerId: printers.id,
			serialNo: printers.serialNo,
			model: models.name,
			client: clients.name,
			notes: maintain.notes,
			createdAt: maintain.createdAt,
		})
		.from(maintain)
		.innerJoin(deployments, eq(maintain.deploymentId, deployments.id))
		.innerJoin(printers, eq(printers.id, deployments.printerId))
		.innerJoin(models, eq(models.id, deployments.modelId))
		.innerJoin(clients, eq(clients.id, deployments.clientId))
		.where(
			and(
				sql`${maintain.notes} IS NOT NULL`,
				ilike(maintain.notes, `%${keyword}%`)
			)
		)
		.orderBy(desc(maintain.createdAt))
		.limit(MAX_RESULTS);

	return NextResponse.json({ results: rows, truncated: rows.length === MAX_RESULTS });
}
