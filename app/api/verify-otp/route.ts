import { NextResponse } from "next/server";
import { db } from "@/db"; // your Drizzle db
import { otps } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(req: Request) {
	const { phone, otp } = await req.json();

	const [otpEntry] = await db
		.select()
		.from(otps)
		.where(and(eq(otps.phone, phone), eq(otps.code, otp)));

	if (!otpEntry) {
		return new Response(
			JSON.stringify({ valid: false, message: "Invalid OTP" }),
			{
				status: 400,
			}
		);
	}

	if (new Date() > otpEntry.expiresAt) {
		return new Response(
			JSON.stringify({ valid: false, message: "OTP expired" }),
			{
				status: 400,
			}
		);
	}

	// Optional: delete OTP after verification
	await db.delete(otps).where(eq(otps.phone, phone));

	return NextResponse.json({ verified: true }, { status: 200 });
}
