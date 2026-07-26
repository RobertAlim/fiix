// app/api/admin/import/deployments/route.ts
//
// A "printer" in this schema is really two rows (see app/api/admin/master/
// printers/route.ts for the single-record equivalent): the printers table
// (serialNo + immutable original client) and its active deployment row
// (model/client/location/department/date, deployedHere=true). This importer
// handles both from one CSV, since the recovery export this was built for
// (restoring lost deployments data) needs exactly that: some serialNos may
// already exist as printers (only the deployment needs recreating), others
// may not exist at all (both need creating).
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
import { eq } from "drizzle-orm";
import { parseCsvText, trimCell, newResult } from "@/lib/csv-import";

const bodySchema = z.object({ csv: z.string().min(1) });
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REQUIRED_COLUMNS = [
	"serialno",
	"model",
	"client",
	"location",
	"department",
	"deployedclient",
	"deploymentdate",
];

export async function POST(req: Request) {
	const authResult = await requireRole(["Admin"]);
	if (authResult.error) return authResult.error;

	const parsed = bodySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json({ error: "Missing CSV content." }, { status: 400 });
	}

	const parsedCsv = parseCsvText(parsed.data.csv);
	if ("error" in parsedCsv) {
		return NextResponse.json({ error: parsedCsv.error }, { status: 400 });
	}

	const missingColumns = REQUIRED_COLUMNS.filter(
		(c) => !parsedCsv.headers.includes(c)
	);
	if (missingColumns.length > 0) {
		return NextResponse.json(
			{
				error: `Missing required column(s): ${missingColumns.join(", ")}. Expected: serialNo, model, client, location, department, deployedClient, deploymentDate.`,
			},
			{ status: 400 }
		);
	}

	const result = newResult();

	// --- Preload every lookup in one round trip each, same pattern as the
	// other import routes. Locations are scoped by client, like the
	// locations importer itself. ---
	const [
		allClients,
		allDepartments,
		allModels,
		allLocations,
		allPrinters,
		activeDeployments,
	] = await Promise.all([
		db.select({ id: clients.id, name: clients.name }).from(clients),
		db.select({ id: departments.id, name: departments.name }).from(departments),
		db.select({ id: models.id, name: models.name }).from(models),
		db
			.select({ id: locations.id, name: locations.name, clientId: locations.clientId })
			.from(locations),
		db
			.select({ id: printers.id, serialNo: printers.serialNo })
			.from(printers),
		db
			.select({ printerId: deployments.printerId })
			.from(deployments)
			.where(eq(deployments.deployedHere, true)),
	]);

	const clientByName = new Map(
		allClients.map((c) => [c.name.trim().toLowerCase(), c.id])
	);
	const departmentByName = new Map(
		allDepartments.map((d) => [d.name.trim().toLowerCase(), d.id])
	);
	const modelByName = new Map(
		allModels.map((m) => [m.name.trim().toLowerCase(), m.id])
	);
	const locationByClientAndName = new Map(
		allLocations.map((l) => [
			`${l.clientId}::${l.name.trim().toLowerCase()}`,
			l.id,
		])
	);
	const printerBySerial = new Map(
		allPrinters.map((p) => [p.serialNo.trim().toLowerCase(), p.id])
	);
	const printersWithActiveDeployment = new Set(
		activeDeployments.map((d) => d.printerId)
	);

	// Pass 1: validate every row and resolve everything EXCEPT the printer
	// id for brand-new serial numbers (those don't exist yet).
	interface ValidRow {
		rowNum: number;
		serialNo: string;
		existingPrinterId: number | null;
		originalClientId: number;
		clientId: number;
		locationId: number;
		departmentId: number;
		modelId: number;
		deploymentDate: string;
	}
	const validRows: ValidRow[] = [];
	const seenSerialNos = new Set<string>();

	parsedCsv.rows.forEach((row, idx) => {
		const rowNum = idx + 2;
		const serialNo = trimCell(row, "serialno");
		const modelName = trimCell(row, "model");
		const clientName = trimCell(row, "client");
		const locationName = trimCell(row, "location");
		const departmentName = trimCell(row, "department");
		const originalClientName = trimCell(row, "deployedclient");
		const deploymentDate = trimCell(row, "deploymentdate");

		if (
			!serialNo ||
			!modelName ||
			!clientName ||
			!locationName ||
			!departmentName ||
			!originalClientName ||
			!deploymentDate
		) {
			result.failed++;
			result.errors.push({ row: rowNum, message: "One or more required fields are blank." });
			return;
		}

		if (!DATE_RE.test(deploymentDate)) {
			result.failed++;
			result.errors.push({
				row: rowNum,
				message: `Invalid deploymentDate "${deploymentDate}" — expected YYYY-MM-DD.`,
			});
			return;
		}

		const serialKey = serialNo.toLowerCase();
		if (seenSerialNos.has(serialKey)) {
			result.skipped++;
			result.errors.push({
				row: rowNum,
				message: `Duplicate within file — serial number "${serialNo}" appears more than once.`,
			});
			return;
		}

		const clientId = clientByName.get(clientName.toLowerCase());
		if (!clientId) {
			result.failed++;
			result.errors.push({
				row: rowNum,
				message: `Client "${clientName}" not found. Import clients first.`,
			});
			return;
		}

		const originalClientId = clientByName.get(originalClientName.toLowerCase());
		if (!originalClientId) {
			result.failed++;
			result.errors.push({
				row: rowNum,
				message: `Original client "${originalClientName}" not found. Import clients first.`,
			});
			return;
		}

		const locationId = locationByClientAndName.get(
			`${clientId}::${locationName.toLowerCase()}`
		);
		if (!locationId) {
			result.failed++;
			result.errors.push({
				row: rowNum,
				message: `Location "${locationName}" not found for client "${clientName}". Import locations first.`,
			});
			return;
		}

		const departmentId = departmentByName.get(departmentName.toLowerCase());
		if (!departmentId) {
			result.failed++;
			result.errors.push({
				row: rowNum,
				message: `Department "${departmentName}" not found. Import departments first.`,
			});
			return;
		}

		const modelId = modelByName.get(modelName.toLowerCase());
		if (!modelId) {
			result.failed++;
			result.errors.push({
				row: rowNum,
				message: `Model "${modelName}" not found. Import models first.`,
			});
			return;
		}

		const existingPrinterId = printerBySerial.get(serialKey) ?? null;
		if (existingPrinterId && printersWithActiveDeployment.has(existingPrinterId)) {
			result.skipped++;
			result.errors.push({
				row: rowNum,
				message: `Printer "${serialNo}" already has an active deployment — skipped.`,
			});
			return;
		}

		seenSerialNos.add(serialKey);
		validRows.push({
			rowNum,
			serialNo,
			existingPrinterId,
			originalClientId,
			clientId,
			locationId,
			departmentId,
			modelId,
			deploymentDate,
		});
	});

	// Pass 2: create any printers that don't exist yet, in one batch.
	const rowsNeedingNewPrinter = validRows.filter((r) => r.existingPrinterId === null);
	if (rowsNeedingNewPrinter.length > 0) {
		const created = await db
			.insert(printers)
			.values(
				rowsNeedingNewPrinter.map((r) => ({
					serialNo: r.serialNo,
					deployedClient: r.originalClientId,
				}))
			)
			.returning({ id: printers.id, serialNo: printers.serialNo });

		const createdIdBySerial = new Map(
			created.map((c) => [c.serialNo.trim().toLowerCase(), c.id])
		);
		for (const row of rowsNeedingNewPrinter) {
			row.existingPrinterId = createdIdBySerial.get(row.serialNo.toLowerCase()) ?? null;
		}
	}

	// Pass 3: insert the active deployment for every valid row that
	// resolved to a real printer id (should be all of them at this point).
	const deploymentRows = validRows.filter((r) => r.existingPrinterId !== null);
	if (deploymentRows.length > 0) {
		await db.insert(deployments).values(
			deploymentRows.map((r) => ({
				printerId: r.existingPrinterId!,
				modelId: r.modelId,
				clientId: r.clientId,
				locationId: r.locationId,
				departmentId: r.departmentId,
				deploymentDate: r.deploymentDate,
				deployedHere: true,
			}))
		);
	}

	const failedToResolvePrinter = validRows.length - deploymentRows.length;
	if (failedToResolvePrinter > 0) {
		// Should not happen — defensive only, in case a batch insert above
		// silently returned fewer rows than requested.
		result.failed += failedToResolvePrinter;
	}
	result.imported = deploymentRows.length;

	return NextResponse.json(result, { status: 200 });
}
