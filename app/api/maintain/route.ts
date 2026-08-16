import { db } from "@/db";
import {
	maintain,
	replace,
	repair,
	colors,
	resets,
	printers,
	activeDeployment,
	deployments,
	models,
	clients,
	locations,
	departments,
	signatories,
	maintenanceLocation,
	maintenanceSyncEvents,
} from "@/db/schema";
import { eq, sql, and, desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
	maintainSubmitSchema,
	type MaintainSubmitData,
} from "@/validation/maintainSchema";
import { reverseGeocodeServer } from "@/lib/geocoder";
import { z } from "zod"; // Assuming Zod for validation
import { NextRequest } from "next/server"; // Use NextRequest for easier URL/Body parsing
import { requireRole } from "@/lib/require-role";

export async function GET(req: Request) {
	const authResult = await requireRole(["Admin", "Technician"]);
	if (authResult.error) return authResult.error;

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
				printerId: printers.id,
			})
			.from(maintain)
			.innerJoin(
				activeDeployment,
				eq(maintain.deploymentId, activeDeployment.id)
			)
			.innerJoin(printers, eq(printers.id, activeDeployment.printerId))
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
			deploymentId: activeDeployment.id,
			serialNo: printers.serialNo,
			modelId: activeDeployment.modelId,
			model: models.name,
			clientId: activeDeployment.clientId,
			client: clients.name,
			locationId: activeDeployment.locationId,
			location: locations.name,
			departmentId: activeDeployment.departmentId,
			department: departments.name,
		})
		.from(activeDeployment)
		.innerJoin(printers, eq(activeDeployment.printerId, printers.id))
		.innerJoin(models, eq(activeDeployment.modelId, models.id))
		.innerJoin(clients, eq(activeDeployment.clientId, clients.id))
		.innerJoin(locations, eq(activeDeployment.locationId, locations.id))
		.innerJoin(departments, eq(activeDeployment.departmentId, departments.id))
		.where(eq(printers.serialNo, serialNo))
		.then((rows) => rows[0]);

	if (!maintenanceData) {
		return NextResponse.json(
			{ error: "No matching item found" },
			{ status: 404 }
		);
	}

	// Latest recorded print count for this PRINTER (not just its current
	// deployment) — joins through `deployments` rather than
	// `activeDeployment`, since Printer Transfer retires the old
	// deployment row and inserts a new one, so a printer's full history
	// spans more than one deploymentId over time. "History" is
	// deliberately just this: every past maintain row for the printer,
	// ordered by createdAt — see the printCount column's comment in
	// db/schema.ts.
	const [lastPrintCountRow] = await db
		.select({ printCount: maintain.printCount })
		.from(maintain)
		.innerJoin(deployments, eq(maintain.deploymentId, deployments.id))
		.where(
			and(
				eq(deployments.printerId, maintenanceData.id),
				sql`${maintain.printCount} IS NOT NULL`
			)
		)
		.orderBy(desc(maintain.createdAt))
		.limit(1);

	const maintenanceDataWithHistory = {
		...maintenanceData,
		lastPrintCount: lastPrintCountRow?.printCount ?? null,
	};

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
		maintenanceData: maintenanceDataWithHistory,
		signatories: signatoriesFormatted,
	});
}

export async function POST(req: Request) {
	const authResult = await requireRole(["Admin", "Technician"]);
	if (authResult.error) return authResult.error;

	const body = await req.json();

	// Offline-first envelope: form data + client-generated idempotency UUID +
	// mandatory GPS fix (+ optional client-side geocode and audit trail).
	const parsed = maintainSubmitSchema.safeParse(body);
	if (!parsed.success) {
		return new Response(JSON.stringify(parsed.error.format()), { status: 400 });
	}

	const data = parsed.data;
	const { clientUuid, gps, geocode, auditTrail } = data;

	// Required + monotonic-increase check for printCount — split out from
	// the Zod schema above because it needs a DB lookup (the schema only
	// validates shape/type). printCount is optional at the schema level
	// so purgeMaintainSubmitSchema (Admin backfill tool, no print count
	// field in its form) stays unaffected; THIS route is the real
	// technician submission path, so it's the one that actually requires
	// it. Looked up via deployments (not activeDeployment) — a printer
	// that's been through Printer Transfer has more than one deploymentId
	// over its lifetime, and the "previous recorded value" needs to span
	// all of them, not just the current one.
	if (data.printCount == null) {
		return NextResponse.json(
			{ error: "Print count is required." },
			{ status: 400 }
		);
	}
	const [deployment] = await db
		.select({ printerId: deployments.printerId })
		.from(deployments)
		.where(eq(deployments.id, data.deploymentId))
		.limit(1);
	if (deployment) {
		const [lastPrintCountRow] = await db
			.select({ printCount: maintain.printCount })
			.from(maintain)
			.innerJoin(deployments, eq(maintain.deploymentId, deployments.id))
			.where(
				and(
					eq(deployments.printerId, deployment.printerId),
					sql`${maintain.printCount} IS NOT NULL`
				)
			)
			.orderBy(desc(maintain.createdAt))
			.limit(1);
		if (lastPrintCountRow && data.printCount < lastPrintCountRow.printCount!) {
			return NextResponse.json(
				{
					error: `Print count can't be lower than the last recorded value (${lastPrintCountRow.printCount}).`,
				},
				{ status: 400 }
			);
		}
	}

	try {
		// IDEMPOTENCY — a retried sync of the same locally-saved report replays
		// the same clientUuid. Return the existing record instead of inserting a
		// duplicate, but still make sure its GPS row exists (covers a crash
		// between the maintain insert and the location insert on a prior try).
		const [existing] = await db
			.select({ id: maintain.id })
			.from(maintain)
			.where(eq(maintain.clientUuid, clientUuid))
			.limit(1);

		if (existing) {
			await ensureLocationRow(existing.id, clientUuid, gps, geocode ?? null);
			await recordSyncEvent(clientUuid, "sync-replayed", `mtId=${existing.id}`);
			return Response.json({ id: existing.id, replayed: true });
		}

		// ✅ Step 1: Insert into main maintain table
		const [mt] = await db
			.insert(maintain)
			.values({
				deploymentId: data.deploymentId,
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
				printCount: data.printCount,
				originMTId: data.originMTId,
				clientUuid,
			})
			.returning({ id: maintain.id })
			.onConflictDoNothing({ target: maintain.clientUuid });

		// A concurrent replay (window + service worker racing) can make the
		// insert no-op on the unique clientUuid index — resolve to the winner.
		let mtId: number;
		if (mt) {
			mtId = mt.id;
		} else {
			const [winner] = await db
				.select({ id: maintain.id })
				.from(maintain)
				.where(eq(maintain.clientUuid, clientUuid))
				.limit(1);
			if (!winner) throw new Error("Insert conflict but no existing row");
			await ensureLocationRow(winner.id, clientUuid, gps, geocode ?? null);
			return Response.json({ id: winner.id, replayed: true });
		}

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

		// ✅ Step 3: Normalized GPS record (mandatory). If the device could not
		// reverse-geocode (offline at capture), the server resolves the address
		// now — it is online by definition while handling this request.
		await ensureLocationRow(mtId, clientUuid, gps, geocode ?? null);

		// ✅ Step 4: Persist the device-side audit trail + server receipt.
		if (auditTrail?.length) {
			await db.insert(maintenanceSyncEvents).values(
				auditTrail.map((e) => ({
					clientUuid,
					event: e.event.slice(0, 50),
					detail: e.detail,
					occurredAt: e.occurredAt ? new Date(e.occurredAt) : null,
				}))
			);
		}
		await recordSyncEvent(clientUuid, "server-received", `mtId=${mtId}`);

		return Response.json({ id: mtId });
	} catch (err) {
		console.error("Error saving maintenance record:", err);
		return new Response("Internal Server Error", { status: 500 });
	}
}

/**
 * Insert the maintenance_location row for a report if it doesn't exist yet,
 * reverse-geocoding server-side when the client couldn't. Idempotent via the
 * unique maintenanceId constraint, so replays and races are harmless.
 */
async function ensureLocationRow(
	mtId: number,
	clientUuid: string,
	gps: MaintainSubmitData["gps"],
	clientGeocode: MaintainSubmitData["geocode"] | null
) {
	const [existingLoc] = await db
		.select({ id: maintenanceLocation.id })
		.from(maintenanceLocation)
		.where(eq(maintenanceLocation.maintenanceId, mtId))
		.limit(1);
	if (existingLoc) return;

	let geocode = clientGeocode ?? null;
	if (!geocode) {
		const resolved = await reverseGeocodeServer(gps.latitude, gps.longitude);
		if (resolved) {
			geocode = resolved;
			await recordSyncEvent(clientUuid, "reverse-geocoded", "server-side");
		}
	}

	await db
		.insert(maintenanceLocation)
		.values({
			maintenanceId: mtId,
			latitude: gps.latitude,
			longitude: gps.longitude,
			accuracy: gps.accuracy,
			altitude: gps.altitude ?? null,
			heading: gps.heading ?? null,
			speed: gps.speed ?? null,
			locationName: geocode?.locationName ?? null,
			formattedAddress: geocode?.formattedAddress ?? null,
			city: geocode?.city ?? null,
			province: geocode?.province ?? null,
			country: geocode?.country ?? null,
			postalCode: geocode?.postalCode ?? null,
			capturedAt: new Date(gps.capturedAt),
			gpsProvider: gps.gpsProvider,
			isMockLocation: gps.isMockLocation,
			reverseGeocoded: geocode !== null,
		})
		.onConflictDoNothing({ target: maintenanceLocation.maintenanceId });
}

/** Best-effort server-side sync event — must never fail the request. */
async function recordSyncEvent(
	clientUuid: string,
	event: string,
	detail?: string
) {
	try {
		await db.insert(maintenanceSyncEvents).values({ clientUuid, event, detail });
	} catch (err) {
		console.error("Failed to record sync event:", err);
	}
}

// --- 1. TypeScript/Zod Schema for PATCH Request ---
// Define a schema for the minimum data required for the update
// We'll assume the ID of the record to update is also sent in the body.
const updateSignPathSchema = z.object({
	id: z.number().int().positive(), // The ID of the maintenance record to update
	signPath: z.string().min(1, "Sign path cannot be empty"),
});

type UpdateSignPathBody = z.infer<typeof updateSignPathSchema>;

// --------------------------------------------------------------------------------

/**
 * Handles PATCH requests to update a specific maintenance record's signPath.
 * A PATCH request is semantically correct for partial updates.
 */
export async function PATCH(req: NextRequest) {
	const authResult = await requireRole(["Admin", "Technician"]);
	if (authResult.error) return authResult.error;

	try {
		// 2. Parse the request body
		const body: unknown = await req.json();

		// 3. Validate the request body
		const parsed = updateSignPathSchema.safeParse(body);
		if (!parsed.success) {
			// 400 Bad Request if validation fails
			return new Response(JSON.stringify(parsed.error.format()), {
				status: 400,
			});
		}

		const { id, signPath } = parsed.data as UpdateSignPathBody;

		// 4. Execute the database update
		const [updatedRecord] = await db
			.update(maintain)
			.set({
				// Only set the column you want to update
				signPath: signPath,
				// You might also want to update an 'updatedAt' column here
				// updatedAt: new Date(),
			})
			.where(eq(maintain.id, id)) // IMPORTANT: Target the specific record by ID
			.returning({ id: maintain.id }); // Return the ID of the updated record

		// 5. Check if a record was actually updated
		if (!updatedRecord) {
			// 404 Not Found if the ID didn't match any record
			return new Response("Maintenance record not found.", { status: 404 });
		}

		// 6. Return a successful response (200 OK)
		return Response.json({
			message: "Sign path updated successfully.",
			id: updatedRecord.id,
		});
	} catch (err) {
		console.error("Error updating sign path:", err);
		// 500 Internal Server Error for unexpected database or server errors
		return new Response("Internal Server Error during sign path update", {
			status: 500,
		});
	}
}
