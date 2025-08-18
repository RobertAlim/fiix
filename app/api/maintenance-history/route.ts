import { db } from "@/db";
import {
	maintain,
	users,
	status,
	printers,
	models,
	clients,
	locations,
	departments,
	signatories,
	resets,
	replace,
	repair,
	colors,
	parts,
} from "@/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
	// const data = await db
	// 	.select({
	// 		id: maintain.id,
	// 		serialNo: printers.serialNo,
	// 		client: clients.name,
	// 		location: locations.name,
	// 		department: departments.name,
	// 		headClean: maintain.headClean,
	// 		inkFlush: maintain.inkFlush,
	// 		refillInk: "",
	// 		reset: "",
	// 		cleanPrinter: maintain.cleanPrinter,
	// 		cleanWasteTank: maintain.cleanWasteTank,
	// 		replaceParts: "",
	// 		repairParts: "",
	// 		replaceUnit: maintain.replaceUnit,
	// 		replaceSerialNo: maintain.replaceSerialNo,
	// 		status: status.name,
	// 		notes: maintain.notes,
	// 		technician: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
	// 		signatory: sql<string>`${signatories.firstName} || ' ' || ${signatories.lastName}`,
	// 		mtDate: sql<string>`to_char(${maintain.createdAt}, 'MM/DD/YYYY')`.as(
	// 			"date"
	// 		),
	// 	})
	// 	.from(maintain)
	// 	.innerJoin(printers, eq(printers.id, maintain.printerId))
	// 	.innerJoin(models, eq(printers.modelId, models.id))
	// 	.innerJoin(clients, eq(printers.clientId, clients.id))
	// 	.innerJoin(locations, eq(printers.locationId, locations.id))
	// 	.innerJoin(departments, eq(printers.departmentId, departments.id))
	// 	.innerJoin(status, eq(status.id, maintain.statusId))
	// 	.innerJoin(users, eq(users.id, maintain.userId))
	// 	.innerJoin(signatories, eq(maintain.signatoryId, signatories.id))
	// 	.orderBy(desc(maintain.createdAt));

	let serialNo: string = "";
	const { searchParams } = new URL(req.url);

	const serialNoParam = searchParams.get("serialNo");

	if (
		serialNoParam !== null &&
		serialNoParam !== undefined &&
		serialNoParam !== ""
	) {
		serialNo = serialNoParam;
	}

	const data = await db
		.select({
			id: maintain.id,
			serialNo: printers.serialNo,
			client: clients.name,
			location: locations.name,
			department: departments.name,
			headClean: maintain.headClean,
			inkFlush: maintain.inkFlush,
			refillInk: sql<string>`
            (SELECT
                CASE
                    WHEN ${colors.cyan} = TRUE THEN 'C' ELSE ''
                END ||
                CASE
                    WHEN ${colors.magenta} = TRUE THEN ', M' ELSE ''
                END ||
                CASE
                    WHEN ${colors.yellow} = TRUE THEN ', Y' ELSE ''
                END ||
                CASE
                    WHEN ${colors.black} = TRUE THEN ', K' ELSE ''
                END
             FROM ${colors}
             WHERE ${colors.mtId} = ${maintain.id}
            )
        `.as("refillInk"),
			reset: sql<string>`
            (SELECT STRING_AGG(
                CASE
                    WHEN ${resets.box} = TRUE THEN 'Box' ELSE ''
                END ||
                CASE
                    WHEN ${resets.program} = TRUE THEN ', Program' ELSE ''
                END, ', ')
             FROM ${resets}
             WHERE ${resets.mtId} = ${maintain.id}
            )
        `.as("reset"),
			cleanPrinter: maintain.cleanPrinter,
			cleanWasteTank: maintain.cleanWasteTank,
			replaceParts: sql<string>`
            (SELECT STRING_AGG(${parts.name}, ', ')
             FROM ${replace}
             INNER JOIN ${parts} ON ${replace.partId} = ${parts.id}
             WHERE ${replace.mtId} = ${maintain.id})
        `.as("replaceParts"),
			repairParts: sql<string>`
            (SELECT STRING_AGG(${parts.name}, ', ')
             FROM ${repair}
             INNER JOIN ${parts} ON ${repair.partId} = ${parts.id}
             WHERE ${repair.mtId} = ${maintain.id})
        `.as("repairParts"),
			replaceUnit: maintain.replaceUnit,
			replaceSerialNo: maintain.replaceSerialNo,
			status: status.name,
			notes: maintain.notes,
			technician: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
			signatory: sql<string>`${signatories.firstName} || ' ' || ${signatories.lastName}`,
			mtDate: sql<string>`to_char(${maintain.createdAt}, 'MM/DD/YYYY')`.as(
				"date"
			),
		})
		.from(maintain)
		.innerJoin(printers, eq(printers.id, maintain.printerId))
		.innerJoin(models, eq(printers.modelId, models.id))
		.innerJoin(clients, eq(printers.clientId, clients.id))
		.innerJoin(locations, eq(printers.locationId, locations.id))
		.innerJoin(departments, eq(printers.departmentId, departments.id))
		.innerJoin(status, eq(status.id, maintain.statusId))
		.innerJoin(users, eq(users.id, maintain.userId))
		.innerJoin(signatories, eq(maintain.signatoryId, signatories.id))
		.where(eq(printers.serialNo, serialNo))
		.orderBy(desc(maintain.createdAt));

	if (!data) {
		return NextResponse.json(
			{ error: "No matching item found" },
			{ status: 404 }
		);
	}

	return NextResponse.json(data, { status: 200 });
}
