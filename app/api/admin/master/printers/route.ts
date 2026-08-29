import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/require-role";
import { db } from "@/db";
import {
	printers,
	deployments,
	clients,
	locations,
	departments,
	models,
} from "@/db/schema";
import { asc, eq, and, ilike, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

// A "printer" in this schema is really two rows: the printers table (just
// serialNo + owning client) and its current deployments row (model,
// location, department, deployment date). This module manages both
// together as one logical record, since neither half is meaningful alone —
// a printer with no deployment row doesn't show up anywhere else in the app.
const bodySchema = z.object({
	serialNo: z.string().trim().min(1, "Serial number is required").max(50),
	clientId: z.number().int().positive(),
	locationId: z.number().int().positive(),
	departmentId: z.number().int().positive(),
	modelId: z.number().int().positive(),
	deploymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Deployment date must be YYYY-MM-DD"),
	// Optional at create time — defaults to "Active" below, same as the
	// column's own DB default. The Edit Printer form's Status radio cards
	// always send one of these three; other callers (e.g. the CSV
	// importer) can omit it.
	status: z.enum(["Active", "Inactive", "Missing"]).optional(),
});

// Page size is capped server-side so a hand-edited ?pageSize= can't be used
// to pull the entire deployment table in one request.
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export async function GET(req: Request) {
	const auth = await requireRole(["Admin"]);
	if (auth.error) return auth.error;

	const params = new URL(req.url).searchParams;
	const currentClient = alias(clients, "current_client");

	// `search` is the legacy single-box parameter (serial number only). It is
	// still honoured so any other caller keeps working; the Printers module
	// now sends the named filters below instead.
	const serialNo = params.get("serialNo") ?? params.get("search");
	const client = params.get("client");
	const location = params.get("location");
	const department = params.get("department");
	const model = params.get("model");
	const status = params.get("status");

	const filters: SQL[] = [];
	if (serialNo?.trim()) filters.push(ilike(printers.serialNo, `%${serialNo.trim()}%`));
	if (client?.trim()) filters.push(ilike(currentClient.name, `%${client.trim()}%`));
	if (location?.trim()) filters.push(ilike(locations.name, `%${location.trim()}%`));
	if (department?.trim()) filters.push(ilike(departments.name, `%${department.trim()}%`));
	if (model?.trim()) filters.push(ilike(models.name, `%${model.trim()}%`));
	// Exact match, not ilike — "Active" is a substring of "Inactive", so a
	// substring match here would incorrectly also return Inactive printers
	// when filtering for Active ones. Silently ignored if it's not one of
	// the three real values, same as any other unrecognized filter input.
	if (status?.trim() && ["Active", "Inactive", "Missing"].includes(status.trim())) {
		filters.push(eq(printers.status, status.trim() as "Active" | "Inactive" | "Missing"));
	}

	const where = filters.length ? and(...filters) : undefined;

	const requestedSize = Number(params.get("pageSize"));
	const pageSize =
		Number.isFinite(requestedSize) && requestedSize > 0
			? Math.min(Math.floor(requestedSize), MAX_PAGE_SIZE)
			: DEFAULT_PAGE_SIZE;
	const requestedPage = Number(params.get("page"));
	const page =
		Number.isFinite(requestedPage) && requestedPage > 0
			? Math.floor(requestedPage)
			: 1;

	// The printer's CURRENT deployment. Should always be at most one row
	// per printer (deployedHere: true is meant to be exclusive), but a
	// stray duplicate has shown up in production at least once — an
	// (outer-joined) match on just `deployedHere = true` silently
	// duplicates that printer's row (and inflates the count query's
	// total) when it happens. This makes the query itself hold the
	// invariant, deterministically picking the most-recently-created
	// deployedHere row, instead of trusting the data to already be clean.
	const currentDeployment = db.$with("current_deployment").as(
		db
			.selectDistinctOn([deployments.printerId], {
				printerId: deployments.printerId,
				clientId: deployments.clientId,
				locationId: deployments.locationId,
				departmentId: deployments.departmentId,
				modelId: deployments.modelId,
				deploymentDate: deployments.deploymentDate,
			})
			.from(deployments)
			.where(eq(deployments.deployedHere, true))
			.orderBy(deployments.printerId, sql`${deployments.id} desc`)
	);

	// The joins are repeated verbatim between the page query and the count
	// query because the filters can target any joined table (client, location,
	// department, model) — counting off `printers` alone would over-report as
	// soon as one of those filters is active.
	const rowsQuery = db
		.with(currentDeployment)
		.select({
			id: printers.id,
			serialNo: printers.serialNo,
			// Current client: sourced from the active deployment, updates
			// whenever the printer is transferred. Named to match the
			// editable "Client" form field (editing it = a transfer).
			clientId: currentDeployment.clientId,
			clientName: currentClient.name,
			// Original client: set once at creation, immutable — read-only
			// display field, not part of the edit form. See the design note
			// in the PATCH handler for why this is never updated.
			originalClientId: printers.deployedClient,
			originalClientName: clients.name,
			locationId: currentDeployment.locationId,
			locationName: locations.name,
			departmentId: currentDeployment.departmentId,
			departmentName: departments.name,
			modelId: currentDeployment.modelId,
			modelName: models.name,
			deploymentDate: currentDeployment.deploymentDate,
			// "Active" | "Inactive" | "Missing" — see printers.status's doc
			// comment in db/schema.ts. Editable from the Edit Printer form's
			// Status selector; "Missing" is also set via the Transfer
			// Printer dialog's Mark Missing/Found actions.
			status: printers.status,
		})
		.from(printers)
		.innerJoin(clients, eq(clients.id, printers.deployedClient))
		.leftJoin(currentDeployment, eq(currentDeployment.printerId, printers.id))
		.leftJoin(currentClient, eq(currentClient.id, currentDeployment.clientId))
		.leftJoin(locations, eq(locations.id, currentDeployment.locationId))
		.leftJoin(departments, eq(departments.id, currentDeployment.departmentId))
		.leftJoin(models, eq(models.id, currentDeployment.modelId))
		.where(where)
		.orderBy(asc(printers.serialNo))
		.limit(pageSize)
		.offset((page - 1) * pageSize);

	const countQuery = db
		.with(currentDeployment)
		.select({ value: sql<number>`count(*)::int` })
		.from(printers)
		.innerJoin(clients, eq(clients.id, printers.deployedClient))
		.leftJoin(currentDeployment, eq(currentDeployment.printerId, printers.id))
		.leftJoin(currentClient, eq(currentClient.id, currentDeployment.clientId))
		.leftJoin(locations, eq(locations.id, currentDeployment.locationId))
		.leftJoin(departments, eq(departments.id, currentDeployment.departmentId))
		.leftJoin(models, eq(models.id, currentDeployment.modelId))
		.where(where);

	const [rows, [count]] = await Promise.all([rowsQuery, countQuery]);

	// Envelope shape ({ rows, total }) is what tells MasterDataManager to
	// switch into server-driven pagination. Endpoints that still return a
	// bare array keep paginating client-side.
	return NextResponse.json({
		rows,
		total: count?.value ?? 0,
		page,
		pageSize,
	});
}

export async function POST(req: Request) {
	const auth = await requireRole(["Admin"]);
	if (auth.error) return auth.error;

	const parsed = bodySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json(
			{ error: parsed.error.issues[0]?.message ?? "Invalid input." },
			{ status: 400 }
		);
	}
	const { serialNo, clientId, locationId, departmentId, modelId, deploymentDate, status } =
		parsed.data;

	// Validate referenced master data actually exists before writing.
	const [[client], [location], [department], [model]] = await Promise.all([
		db.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId)).limit(1),
		db.select({ id: locations.id }).from(locations).where(eq(locations.id, locationId)).limit(1),
		db.select({ id: departments.id }).from(departments).where(eq(departments.id, departmentId)).limit(1),
		db.select({ id: models.id }).from(models).where(eq(models.id, modelId)).limit(1),
	]);
	if (!client) return NextResponse.json({ error: "Selected client does not exist." }, { status: 400 });
	if (!location) return NextResponse.json({ error: "Selected location does not exist." }, { status: 400 });
	if (!department) return NextResponse.json({ error: "Selected department does not exist." }, { status: 400 });
	if (!model) return NextResponse.json({ error: "Selected model does not exist." }, { status: 400 });

	const [dup] = await db
		.select({ id: printers.id })
		.from(printers)
		.where(ilike(printers.serialNo, serialNo))
		.limit(1);
	if (dup) {
		return NextResponse.json(
			{ error: `A printer with serial number "${serialNo}" already exists.` },
			{ status: 400 }
		);
	}

	const [printer] = await db
		.insert(printers)
		.values({ serialNo, deployedClient: clientId, status: status ?? "Active" })
		.returning();

	await db.insert(deployments).values({
		printerId: printer.id,
		modelId,
		clientId,
		locationId,
		departmentId,
		deploymentDate,
		deployedHere: true,
	});

	return NextResponse.json({ id: printer.id, serialNo }, { status: 201 });
}
