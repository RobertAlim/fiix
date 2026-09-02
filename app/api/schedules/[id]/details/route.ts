import { NextResponse } from "next/server";
import { db } from "@/db";
import { eq, and, desc } from "drizzle-orm";
import {
	scheduleDetails as sd,
	printers,
	maintain,
	deployments,
	models,
	supportServices,
	supportServiceType,
} from "@/db/schema";
import type { ScheduleDetailRow, ScheduleSupportServiceDetail } from "@/types/tracker";
import { requireRole } from "@/lib/require-role";
import { getSignedUrlForDownload } from "@/lib/r2";

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

	// Support Service detail — only meaningful when this schedule has NO
	// printers (data.length === 0). Queried unconditionally rather than
	// gated on that check purely for simplicity (one extra cheap query on
	// a printer schedule just returns nothing); the FRONTEND is what
	// decides whether to show the printer table or this card, based on
	// which one actually has content.
	const [supportRow] = await db
		.select({
			id: supportServices.id,
			supportServiceTypeId: supportServices.supportServiceTypeId,
			supportServiceType: supportServiceType.name,
			status: supportServices.status,
			technicianNotes: supportServices.technicianNotes,
			photoUrl: supportServices.photoUrl,
			completedAt: supportServices.completedAt,
		})
		.from(supportServices)
		.innerJoin(
			supportServiceType,
			eq(supportServiceType.id, supportServices.supportServiceTypeId)
		)
		.where(eq(supportServices.scheduleId, scheduleId))
		.limit(1);

	let supportService: ScheduleSupportServiceDetail | null = null;
	if (supportRow) {
		// photoUrl in the DB is a bare R2 object key (see
		// sync-engine.ts's uploadToR2 on the mobile side — it returns the
		// key, not a URL) — not independently viewable as an <img src>
		// without a signed GET URL, same reasoning as maintain.nozzlePath
		// in app/api/pdf/route.tsx. Presigned fresh on every request
		// rather than stored, so a leaked/cached link expires quickly.
		let signedPhotoUrl: string | null = null;
		if (supportRow.photoUrl) {
			try {
				signedPhotoUrl = await getSignedUrlForDownload(supportRow.photoUrl, "fiixsupport");
			} catch (err) {
				console.error(
					`Error generating signed URL for support service photo "${supportRow.photoUrl}":`,
					err
				);
				signedPhotoUrl = null;
			}
		}
		supportService = {
			id: supportRow.id,
			supportServiceTypeId: supportRow.supportServiceTypeId,
			supportServiceType: supportRow.supportServiceType,
			status: supportRow.status as ScheduleSupportServiceDetail["status"],
			technicianNotes: supportRow.technicianNotes,
			photoUrl: signedPhotoUrl,
			completedAt: (supportRow.completedAt as unknown as string) ?? null,
		};
	}

	return NextResponse.json({ data, supportService });
}
