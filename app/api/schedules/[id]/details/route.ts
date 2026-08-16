import { NextResponse } from "next/server";
import { db } from "@/db";
import { eq, and, desc } from "drizzle-orm";
import {
	scheduleDetails as sd,
	printers,
	maintain,
	deployments,
	models,
} from "@/db/schema";
import type { ScheduleDetailRow } from "@/types/tracker";
import { requireRole } from "@/lib/require-role";

export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ id: string }> }
) {
	const authResult = await requireRole(["Admin", "Scheduler"]);
	if (authResult.error) return authResult.error;

	const { id } = await params;
	const scheduleId = Number(id);
	if (!Number.isFinite(scheduleId)) {
		return new NextResponse("Invalid schedule id", { status: 400 });
	}

	// IMPORTANT COLUMN NOTE:
	// If your column is named `mtId`, replace `sd.originMTId` with `sd.mtId` below.
	// Left-joined and scoped to deployedHere: true — same reasoning as the
	// React "duplicate key" fix elsewhere in this project (see the
	// standing notes in this project's memory): a printer that was
	// transferred away and later transferred back has multiple deployments
	// rows, and joining without this filter would either duplicate the
	// schedule-detail row or silently show a stale/wrong model. Left, not
	// inner, so a printer with no active deployment (mid-transfer, or
	// legacy data) still renders — with a blank Model rather than
	// disappearing from the list entirely.
	const rows = await db
		.select({
			id: sd.id,
			printerId: sd.printerId,
			serialNo: printers.serialNo,
			model: models.name,
			isMaintained: sd.isMaintained,
			maintainedDate: sd.maintainedDate,
			mtId: sd.originMTId, // <-- adjust here if your col is `mtId`
			statusId: maintain.statusId,
			signPath: maintain.signPath,
		})
		.from(sd)
		.innerJoin(printers, eq(printers.id, sd.printerId))
		.leftJoin(
			deployments,
			and(eq(deployments.printerId, printers.id), eq(deployments.deployedHere, true))
		)
		.leftJoin(models, eq(models.id, deployments.modelId))
		.leftJoin(maintain, eq(maintain.id, sd.originMTId))
		.where(eq(sd.scheduleId, scheduleId))
		.orderBy(desc(maintain.createdAt));

	const data: ScheduleDetailRow[] = rows.map((r) => ({
		id: r.id,
		printerId: r.printerId,
		serialNo: r.serialNo,
		model: r.model ?? null,
		isMaintained: !!r.isMaintained,
		maintainedDate: (r.maintainedDate as unknown as string) ?? null,
		mtId: (r.mtId as unknown as number) ?? null,
		statusId: (r.statusId as unknown as number) ?? null,
		signPath: r.signPath as string | null,
	}));

	return NextResponse.json({ data });
}
