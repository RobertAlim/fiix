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
import { asc, eq, and, ilike } from "drizzle-orm";
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
});

export async function GET(req: Request) {
	const auth = await requireRole(["Admin"]);
	if (auth.error) return auth.error;

	const search = new URL(req.url).searchParams.get("search");
	const currentClient = alias(clients, "current_client");

	const rows = await db
		.select({
			id: printers.id,
			serialNo: printers.serialNo,
			// Current client: sourced from the active deployment, updates
			// whenever the printer is transferred. Named to match the
			// editable "Client" form field (editing it = a transfer).
			clientId: deployments.clientId,
			clientName: currentClient.name,
			// Original client: set once at creation, immutable — read-only
			// display field, not part of the edit form. See the design note
			// in the PATCH handler for why this is never updated.
			originalClientId: printers.deployedClient,
			originalClientName: clients.name,
			locationId: deployments.locationId,
			locationName: locations.name,
			departmentId: deployments.departmentId,
			departmentName: departments.name,
			modelId: deployments.modelId,
			modelName: models.name,
			deploymentDate: deployments.deploymentDate,
		})
		.from(printers)
		.innerJoin(clients, eq(clients.id, printers.deployedClient))
		.leftJoin(
			deployments,
			and(eq(deployments.printerId, printers.id), eq(deployments.deployedHere, true))
		)
		.leftJoin(currentClient, eq(currentClient.id, deployments.clientId))
		.leftJoin(locations, eq(locations.id, deployments.locationId))
		.leftJoin(departments, eq(departments.id, deployments.departmentId))
		.leftJoin(models, eq(models.id, deployments.modelId))
		.where(search ? ilike(printers.serialNo, `%${search}%`) : undefined)
		.orderBy(asc(printers.serialNo));

	return NextResponse.json(rows);
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
	const { serialNo, clientId, locationId, departmentId, modelId, deploymentDate } =
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
		.values({ serialNo, deployedClient: clientId })
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
