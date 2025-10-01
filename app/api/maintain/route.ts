import { db } from "@/db";
import {
	maintain,
	replace,
	repair,
	colors,
	resets,
	printers,
	models,
	clients,
	locations,
	departments,
	signatories,
} from "@/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { maintainFormSchema } from "@/validation/maintainSchema";

export async function GET(req: Request) {
	const { searchParams } = new URL(req.url);
	const serialNo = searchParams.get("serialNo");

	if (!serialNo) {
		return NextResponse.json({ error: "Missing serialNo" }, { status: 400 });
	}

	const today = new Date().toISOString().split("T")[0]; // e.g., '2025-07-21'
	const checkDupSerialNo = // Drizzle ORM query
		await db
			.select({
				serialNo: printers.serialNo,
				printerId: maintain.printerId,
			})
			.from(maintain)
			.innerJoin(printers, eq(printers.id, maintain.printerId))
			.where(
				and(
					sql`DATE(${maintain.createdAt}) = ${today}`,
					eq(printers.serialNo, serialNo)
				)
			);

	if (checkDupSerialNo.length > 0) {
		return NextResponse.json({ error: "Duplicate" }, { status: 404 });
	}

	const maintenanceData = await db
		.select({
			id: printers.id,
			serialNo: printers.serialNo,
			modelId: printers.modelId,
			model: models.name,
			clientId: printers.clientId,
			client: clients.name,
			locationId: printers.locationId,
			location: locations.name,
			departmentId: printers.departmentId,
			department: departments.name,
		})
		.from(printers)
		.innerJoin(models, eq(printers.modelId, models.id))
		.innerJoin(clients, eq(printers.clientId, clients.id))
		.innerJoin(locations, eq(printers.locationId, locations.id))
		.innerJoin(departments, eq(printers.departmentId, departments.id))
		.where(eq(printers.serialNo, serialNo))
		.then((rows) => rows[0]);

	if (!maintenanceData) {
		return NextResponse.json(
			{ error: "No matching item found" },
			{ status: 404 }
		);
	}

	const signatoryList = await db
		.select({
			id: signatories.id,
			firstName: signatories.firstName,
			lastName: signatories.lastName,
		})
		.from(signatories)
		.where(eq(signatories.clientId, maintenanceData.clientId));

	// Transform to { value, label } format
	const signatoriesFormatted = signatoryList.map((s) => ({
		value: s.id.toString(),
		label: `${s.firstName} ${s.lastName}`,
	}));

	return NextResponse.json({
		maintenanceData,
		signatories: signatoriesFormatted,
	});
}

export async function POST(req: Request) {
	const body = await req.json();

	const parsed = maintainFormSchema.safeParse(body);
	if (!parsed.success) {
		return new Response(JSON.stringify(parsed.error.format()), { status: 400 });
	}

	const data = parsed.data;

	try {
		// ✅ Step 1: Insert into main maintain table
		const [mt] = await db
			.insert(maintain)
			.values({
				printerId: data.printerId,
				clientId: data.client.value,
				locationId: data.location?.value,
				departmentId: data.department?.value,
				headClean: data.headClean,
				inkFlush: data.inkFlush,
				cleanPrinter: data.cleanPrinter,
				cleanWasteTank: data.cleanWasteTank,
				replaceUnit: data.replaceUnit,
				replaceSerialNo: data.replaceSerialNo,
				statusId: data.status,
				notes: data.notes,
				userId: data.userId,
				signatoryId: data.signatoryId,
				signPath: data.signPath,
				nozzlePath: data.nozzlePath,
				originMTId: data.originMTId,
			})
			.returning({ id: maintain.id });

		const mtId = mt.id;

		// ✅ Step 2: Conditionally insert parts and related tables
		if (data.replace && data.replaceParts?.length) {
			await db.insert(replace).values(
				data.replaceParts.map((part) => ({
					mtId,
					partId: Number(part.partId),
				}))
			);
		}

		if (data.repair && data.repairParts?.length) {
			await db.insert(repair).values(
				data.repairParts.map((part) => ({
					mtId,
					partId: Number(part.partId),
				}))
			);
		}

		if (data.colorSelected) {
			await db.insert(colors).values({
				mtId,
				cyan: data.cyan,
				magenta: data.magenta,
				yellow: data.yellow,
				black: data.black,
			});
		}

		if (data.resetSelected) {
			await db.insert(resets).values({
				mtId,
				box: data.resetBox,
				program: data.resetProgram,
			});
		}

		return Response.json({ id: mtId });
	} catch (err) {
		console.error("Error saving maintenance record:", err);
		return new Response("Internal Server Error", { status: 500 });
	}
}
