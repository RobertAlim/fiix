// app/api/sched-details/route.ts
import { db } from "@/db"; // your Drizzle setup
import { scheduleDetails } from "@/db/schema"; // your table schema
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
	try {
		const body = await req.json();
		const { schedDetailsId } = body;

		if (!schedDetailsId) {
			return new Response("Missing schedDetailsId", { status: 400 });
		}

		console.log("✅ Updating scheduleDetails.id:", schedDetailsId);

		await db
			.update(scheduleDetails)
			.set({
				isMaintained: true,
				maintainedDate: new Date(), // ← uncomment this if needed
			})
			.where(eq(scheduleDetails.id, schedDetailsId));

		return NextResponse.json({ success: true });
	} catch (err) {
		return NextResponse.json({ success: true });
		console.error("❌ Error updating scheduleDetails:", err);
		return new Response("Internal Server Error", { status: 500 });
	}
}
