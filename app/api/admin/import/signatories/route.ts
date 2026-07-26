// app/api/admin/import/signatories/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/require-role";
import { db } from "@/db";
import { clients, signatories } from "@/db/schema";
import { parseCsvText, trimCell, newResult } from "@/lib/csv-import";

const bodySchema = z.object({ csv: z.string().min(1) });
const MAX_NAME_LENGTH = 20;

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

	if (
		!parsedCsv.headers.includes("firstname") ||
		!parsedCsv.headers.includes("lastname")
	) {
		return NextResponse.json(
			{
				error:
					"Missing required column(s). Expected: firstName, lastName (client is optional).",
			},
			{ status: 400 }
		);
	}

	const result = newResult();

	const allClients = await db.select({ id: clients.id, name: clients.name }).from(clients);
	const clientByName = new Map(
		allClients.map((c) => [c.name.trim().toLowerCase(), c.id])
	);

	const existingSignatories = await db
		.select({
			firstName: signatories.firstName,
			lastName: signatories.lastName,
			clientId: signatories.clientId,
		})
		.from(signatories);
	const existingKey = new Set(
		existingSignatories.map(
			(s) =>
				`${s.clientId ?? "none"}::${s.firstName.trim().toLowerCase()}::${s.lastName
					.trim()
					.toLowerCase()}`
		)
	);

	const seenInFile = new Set<string>();
	const toInsert: { firstName: string; lastName: string; clientId: number | null }[] = [];

	parsedCsv.rows.forEach((row, idx) => {
		const rowNum = idx + 2;
		const firstName = trimCell(row, "firstname");
		const lastName = trimCell(row, "lastname");
		const clientName = trimCell(row, "client");

		if (!firstName || !lastName) {
			result.failed++;
			result.errors.push({ row: rowNum, message: "Missing firstName or lastName." });
			return;
		}
		if (firstName.length > MAX_NAME_LENGTH || lastName.length > MAX_NAME_LENGTH) {
			result.failed++;
			result.errors.push({
				row: rowNum,
				message: `Names must be ${MAX_NAME_LENGTH} characters or fewer.`,
			});
			return;
		}

		let clientId: number | null = null;
		if (clientName) {
			const found = clientByName.get(clientName.toLowerCase());
			if (!found) {
				result.failed++;
				result.errors.push({
					row: rowNum,
					message: `Client "${clientName}" not found. Import clients first.`,
				});
				return;
			}
			clientId = found;
		}

		const key = `${clientId ?? "none"}::${firstName.toLowerCase()}::${lastName.toLowerCase()}`;
		if (existingKey.has(key)) {
			result.skipped++;
			result.errors.push({
				row: rowNum,
				message: `Duplicate — "${firstName} ${lastName}" already exists${
					clientName ? ` for client "${clientName}"` : ""
				}.`,
			});
			return;
		}
		if (seenInFile.has(key)) {
			result.skipped++;
			result.errors.push({
				row: rowNum,
				message: `Duplicate within file — "${firstName} ${lastName}" appears more than once.`,
			});
			return;
		}

		seenInFile.add(key);
		toInsert.push({ firstName, lastName, clientId });
	});

	if (toInsert.length > 0) {
		await db.insert(signatories).values(toInsert);
		result.imported = toInsert.length;
	}

	return NextResponse.json(result, { status: 200 });
}
