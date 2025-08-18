// app/api/pdf/route.ts
import { NextResponse, type NextRequest } from "next/server";
import {
	MaintainReport,
	MaintenanceReportProps,
} from "@/components/print/MaintainReport"; // Adjust the import path as necessary
import ReactPDF from "@react-pdf/renderer";
import { db } from "@/db";
import {
	maintain,
	printers,
	models,
	clients,
	locations,
	departments,
	status,
	users,
	signatories,
	colors,
	resets,
	replace,
	repair,
	parts,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream"; // Import Node.js Readable stream

const r2 = new S3Client({
	region: "auto",
	endpoint: process.env.endpoint ?? "",
	credentials: {
		accessKeyId: process.env.accessKeyId ?? "",
		secretAccessKey: process.env.secretAccessKey ?? "",
	},
});

async function streamToBuffer(stream: Readable): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		stream.on("data", (chunk: Buffer) => chunks.push(chunk));
		stream.on("error", reject);
		stream.on("end", () => resolve(Buffer.concat(chunks)));
	});
}

export async function GET(request: NextRequest) {
	try {
		const mtId = Number(request.nextUrl.searchParams.get("mtId")); // Replace with the actual maintenance ID you want to fetch
		const [mt] = await db
			.select({
				id: printers.id,
				client: clients.name,
				location: locations.name,
				department: departments.name,
				serialNo: printers.serialNo,
				model: models.name,
				date: maintain.createdAt,
				headClean: maintain.headClean,
				inkFlush: maintain.inkFlush,
				cleanPrinter: maintain.cleanPrinter,
				cleanWasteTank: maintain.cleanWasteTank,
				replaceUnit: maintain.replaceUnit,
				replaceSerialNo: maintain.replaceSerialNo,
				status: status.name,
				technician: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
				signatory: sql<string>`${signatories.firstName} || ' ' || ${signatories.lastName}`,
				signPath: maintain.signPath,
			})
			.from(maintain)
			.innerJoin(printers, eq(printers.id, maintain.printerId))
			.innerJoin(models, eq(printers.modelId, models.id))
			.innerJoin(clients, eq(printers.clientId, clients.id))
			.innerJoin(locations, eq(printers.locationId, locations.id))
			.innerJoin(departments, eq(printers.departmentId, departments.id))
			.innerJoin(status, eq(status.id, maintain.statusId))
			.innerJoin(users, eq(users.id, maintain.userId))
			.innerJoin(signatories, eq(signatories.id, maintain.signatoryId))
			.where(eq(maintain.id, mtId));

		if (!mt) {
			console.warn(`Maintenance record with ID ${mtId} not found.`);
			return new NextResponse(
				JSON.stringify({
					error: `Maintenance record with ID ${mtId} not found.`,
				}),
				{ status: 404 }
			);
		}

		// To get the signature image in cloudflare R2 storage
		if (mt.signPath) {
			try {
				const command = new GetObjectCommand({
					Bucket: process.env.bucketName ?? "",
					Key: mt.signPath,
				});

				const response = await r2.send(command);

				// Check if response.Body is a Node.js Readable stream
				if (response.Body instanceof Readable) {
					const imageBuffer = await streamToBuffer(response.Body);
					const base64Image = imageBuffer.toString("base64");
					const contentType = response.ContentType || "image/png"; // Default to png if content type not provided
					const signatureImageUrl = `data:${contentType};base64,${base64Image}`;
					mt.signPath = signatureImageUrl; // Update mt.signPath with the base64 image string
				} else {
					console.warn(
						`Signature image "${mt.signPath}" not found or not a readable stream from R2.`
					);
				}
			} catch (error) {
				console.error(
					`Error fetching signature image "${mt.signPath}":`,
					error
				);
			}
		}

		//Join: Refill colors
		const [color] = await db.select().from(colors).where(eq(colors.mtId, mtId));

		// Join: Reset data
		const [reset] = await db.select().from(resets).where(eq(resets.mtId, mtId));

		// Join: Replace parts
		const replaceParts = await db
			.select({ partName: parts.name })
			.from(replace)
			.innerJoin(parts, eq(parts.id, replace.partId))
			.where(eq(replace.mtId, mtId));

		// Join: Repair parts
		const repairParts = await db
			.select({ partName: parts.name })
			.from(repair)
			.innerJoin(parts, eq(parts.id, repair.partId))
			.where(eq(repair.mtId, mtId));

		const data: MaintenanceReportProps = {
			client: mt.client,
			location: mt.location,
			department: mt.department,
			model: mt.model,
			serialNo: mt.serialNo,
			date: mt.date, // e.g., "2025-06-30"
			workDone: [
				mt.headClean && "Head Clean",
				mt.inkFlush && "Ink Flushing",
			].filter(Boolean) as string[],
			refillInk: [
				color?.cyan && "Cyan",
				color?.magenta && "Magenta",
				color?.yellow && "Yellow",
				color?.black && "Black",
			].filter(Boolean) as string[],
			resetBox: [reset?.box && "Box", reset?.program && "Program"].filter(
				Boolean
			) as string[],
			services: [
				mt.cleanPrinter && "Cleaning of Printer",
				mt.cleanWasteTank && "Cleaning of Waste Tank",
			].filter(Boolean) as string[],
			replaceParts: replaceParts.map((r) => r.partName),
			repairParts: repairParts.map((r) => r.partName),
			replaceUnit: !mt.replaceUnit,
			replaceSerialNo: mt.replaceSerialNo || "", // Optional, can be empty if not provided
			status: mt.status,
			technician: mt.technician,
			signatory: mt.signatory,
			signPath: mt.signPath, // this is base64 image string
		};

		const stream = await ReactPDF.renderToStream(
			<MaintainReport data={data} />
		);

		return new NextResponse(stream as any, {
			status: 200,
			headers: {
				"Content-Type": "application/pdf",
				"Content-Disposition": "inline; filename=document.pdf",
			},
		});
	} catch (error) {
		console.error("Error generating maintenance report PDF:", error);
		// Return an error response
		return new NextResponse(
			JSON.stringify({
				error: "Failed to generate PDF. Please try again later.",
			}),
			{ status: 500 }
		);
	}
}
