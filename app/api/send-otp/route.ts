import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { otps } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomInt } from "crypto";
import { z } from "zod";
import { env } from "@/lib/env";

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 1 minute between sends

// PH mobile numbers: 09XXXXXXXXX or +639XXXXXXXXX
const bodySchema = z.object({
	phone: z
		.string()
		.trim()
		.regex(/^(09\d{9}|\+639\d{9})$/, "Invalid Philippine mobile number"),
});

export async function POST(req: Request) {
	const { userId } = await auth();
	if (!userId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const parsed = bodySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
	}
	const { phone } = parsed.data;

	// Resend cooldown: if an OTP was issued < 1 minute ago, reject.
	const [existing] = await db.select().from(otps).where(eq(otps.phone, phone));
	if (existing) {
		const issuedAt = existing.expiresAt.getTime() - OTP_TTL_MS;
		if (Date.now() - issuedAt < RESEND_COOLDOWN_MS) {
			return NextResponse.json(
				{ error: "Please wait a minute before requesting another code" },
				{ status: 429 }
			);
		}
	}

	const otp = String(randomInt(100000, 999999));
	const expiresAt = new Date(Date.now() + OTP_TTL_MS);

	// Replace any existing OTP for this phone
	await db.delete(otps).where(eq(otps.phone, phone));
	await db.insert(otps).values({ phone, code: otp, expiresAt });

	const res = await fetch("https://api.semaphore.co/api/v4/otp", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			apikey: env.SEMAPHORE_API_KEY,
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
