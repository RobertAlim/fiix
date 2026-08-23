import { NextRequest, NextResponse } from "next/server";
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
	scheduleDetails,
	maintain,
} from "@/db/schema";
import { eq, and, ilike, ne, sql, inArray } from "drizzle-orm";

const bodySchema = z.object({
	serialNo: z.string().trim().min(1, "Serial number is required").max(50),
	clientId: z.number().int().positive(),
	locationId: z.number().int().positive(),
	departmentId: z.number().int().positive(),
	modelId: z.number().int().positive(),
	deploymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Deployment date must be YYYY-MM-DD"),
	// Sent by the Edit Printer form's Status radio cards. Optional so other
	// callers of this route don't need to start passing it.
	status: z.enum(["Active", "Inactive", "Missing"]).optional(),
});

function parseId(id: string) {
	const n = Number(id);
	return Number.isInteger(n) && n > 0 ? n : null;
}

export async function PATCH(
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
	const { serialNo, clientId, locationId, departmentId, modelId, deploymentDate, status } =
		parsed.data;

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
		.where(and(ilike(printers.serialNo, serialNo), ne(printers.id, id)))
		.limit(1);
	if (dup) {
		return NextResponse.json(
			{ error: `A printer with serial number "${serialNo}" already exists.` },
			{ status: 400 }
		);
	}

	// NOTE: deliberately not touching printers.deployedClient here — it's
	// the printer's original/first-deployed client, set once at creation
	// and meant to stay unchanged even when the printer is later
	// transferred. "Current client" lives entirely on the active
	// deployment row below, which IS what changes on a transfer.
	//
	// `status` is only included in the update when the caller actually
	// sent one — this keeps any future non-form caller (e.g. a bulk
	// import) from accidentally clobbering a "Missing" flag set via the
	// Transfer Printer dialog just by omitting the field.
	const [updatedPrinter] = await db
		.update(printers)
		.set({ serialNo, ...(status ? { status } : {}) })
		.where(eq(printers.id, id))
		.returning();
	if (!updatedPrinter) {
		return NextResponse.json({ error: "Printer not found." }, { status: 404 });
	}

	const [currentDeployment] = await db
		.select({ id: deployments.id })
		.from(deployments)
		.where(and(eq(deployments.printerId, id), eq(deployments.deployedHere, true)))
		.limit(1);

	if (currentDeployment) {
		await db
			.update(deployments)
			.set({ modelId, clientId, locationId, departmentId, deploymentDate })
			.where(eq(deployments.id, currentDeployment.id));
	} else {
		await db.insert(deployments).values({
			printerId: id,
			modelId,
			clientId,
			locationId,
			departmentId,
			deploymentDate,
			deployedHere: true,
		});
	}

	return NextResponse.json({ success: true });
}

export async function DELETE(
	_req: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	const auth = await requireRole(["Admin"]);
	if (auth.error) return auth.error;

	const id = parseId((await params).id);
	if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

	// Block if actively scheduled — this is a real "in use" reference.
	const [[scheduleRef]] = await Promise.all([
		db
			.select({ count: sql<number>`COUNT(*)` })
			.from(scheduleDetails)
			.where(eq(scheduleDetails.printerId, id)),
	]);
	if (Number(scheduleRef?.count ?? 0) > 0) {
		return NextResponse.json(
			{ error: `Cannot delete — referenced by ${scheduleRef.count} schedule record(s).` },
			{ status: 409 }
		);
	}

	// Block if any of this printer's deployments have real maintenance
	// history — that history shouldn't be silently cascade-deleted.
	const deploymentRows = await db
		.select({ id: deployments.id })
		.from(deployments)
		.where(eq(deployments.printerId, id));

	if (deploymentRows.length > 0) {
		const [maintainRef] = await db
			.select({ count: sql<number>`COUNT(*)` })
			.from(maintain)
			.where(
				inArray(
					maintain.deploymentId,
					deploymentRows.map((d) => d.id)
				)
			);
		if (Number(maintainRef?.count ?? 0) > 0) {
			return NextResponse.json(
				{
					error: `Cannot delete — this printer has ${maintainRef.count} maintenance record(s) on file.`,
				},
				{ status: 409 }
			);
		}
	}

	// Safe to remove: no schedule references, no maintenance history. The
	// printer's own deployment rows are just its deployment metadata, not
	// independent records, so they're cleaned up along with it.
	await db.delete(deployments).where(eq(deployments.printerId, id));
	await db.delete(printers).where(eq(printers.id, id));

	return NextResponse.json({ success: true });
}
