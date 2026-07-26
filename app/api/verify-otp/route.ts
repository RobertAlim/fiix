import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { otps } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const bodySchema = z.object({
	phone: z.string().trim().min(10).max(15),
	otp: z.string().trim().regex(/^\d{6}$/, "OTP must be 6 digits"),
});

export async function POST(req: Request) {
	const { userId } = await auth();
	if (!userId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const parsed = bodySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json(
			{ valid: false, message: "Invalid request" },
			{ status: 400 }
		);
	}
	const { phone, otp } = parsed.data;

	const [otpEntry] = await db
		.select()
		.from(otps)
		.where(and(eq(otps.phone, phone), eq(otps.code, otp)));

	if (!otpEntry) {
		return NextResponse.json(
			{ valid: false, message: "Invalid OTP" },
			{ status: 400 }
		);
	}

	if (new Date() > otpEntry.expiresAt) {
		// Clean up the expired code so it can't linger in the table
		await db.delete(otps).where(eq(otps.phone, phone));
		return NextResponse.json(
			{ valid: false, message: "OTP expired" },
			{ status: 400 }
		);
	}

	// Single-use: delete after successful verification
	await db.delete(otps).where(eq(otps.phone, phone));

	return NextResponse.json({ verified: true }, { status: 200 });
}
