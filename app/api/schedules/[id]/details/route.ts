import { NextResponse } from "next/server";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { scheduleDetails as sd, printers, maintain } from "@/db/schema";
import type { ScheduleDetailRow } from "@/types/tracker";

type RouteCtx = { params: { id: number } };

export async function GET(_req: Request, { params }: RouteCtx) {
	const scheduleId = params.id;
	if (Number.isNaN(scheduleId)) {
		return new NextResponse("Invalid schedule id", { status: 400 });
	}

	// IMPORTANT COLUMN NOTE:
	// If your column is named `mtId`, replace `sd.originMTId` with `sd.mtId` below.
	const rows = await db
		.select({
			id: sd.id,
			printerId: sd.printerId,
			serialNo: printers.serialNo,
			isMaintained: sd.isMaintained,
			maintainedDate: sd.maintainedDate,
			mtId: sd.originMTId, // <-- adjust here if your col is `mtId`
			statusId: maintain.statusId,
		})
		.from(sd)
		.innerJoin(printers, eq(printers.id, sd.printerId))
		.leftJoin(maintain, eq(maintain.id, sd.originMTId))
		.where(eq(sd.scheduleId, scheduleId))
		.orderBy(printers.serialNo);

	const data: ScheduleDetailRow[] = rows.map((r) => ({
		id: r.id,
		printerId: r.printerId,
		serialNo: r.serialNo,
		isMaintained: !!r.isMaintained,
		maintainedDate: (r.maintainedDate as unknown as string) ?? null,
		mtId: (r.mtId as unknown as number) ?? null,
		statusId: (r.statusId as unknown as number) ?? null,
	}));

	return NextResponse.json({ data });
}
