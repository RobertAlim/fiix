import { NextResponse } from "next/server";
import { db } from "@/db"; // your Drizzle db
import { otps } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomInt } from "crypto";

export async function POST(req: Request) {
	const { phone } = await req.json();
	const otp = String(randomInt(100000, 999999)); // e.g., "348920"
	const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes\

	// Delete existing OTPs for the phone
	await db.delete(otps).where(eq(otps.phone, phone));

	// Store new OTP
	await db.insert(otps).values({ phone, code: otp, expiresAt });

	//https://api.semaphore.co/api/v4/messages
	const res = await fetch("https://api.semaphore.co/api/v4/otp", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			apikey: process.env.SEMAPHORE_API_KEY,
			number: phone,
			message: `Your OTP code is ${otp}. Please do not share it with anyone.`,
			sendername: "fiix",
		}),
	});

	if (!res.ok) {
		return NextResponse.json({ error: "Failed to send OTP" }, { status: 500 });
	}

	return NextResponse.json({ success: true });
}
