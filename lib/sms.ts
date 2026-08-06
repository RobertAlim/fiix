// lib/sms.ts
// Thin wrapper around the Semaphore SMS API, factored out of the OTP route
// so the Time In notification can send a plain message through the same
// account rather than duplicating the fetch call.
import { env } from "@/lib/env";
import "server-only";
import { db } from "@/db";
import { smsRecipients, users } from "@/db/schema";
import { eq, and, inArray, isNotNull } from "drizzle-orm";

/**
 * Canonicalizes a PH mobile number to 09XXXXXXXXX.
 *
 * "09171234567" and "+639171234567" are the same physical number but don't
 * compare equal as strings — if both ever end up stored as separate
 * recipients (or the same person's number gets entered twice in different
 * formats), that phone gets every Time In notification twice. Normalizing
 * before both the uniqueness check (recipient CRUD) and before sending
 * (dedup here) closes that gap at its source rather than just at send time.
 * Returns null for anything that isn't a valid PH mobile number.
 */
export function normalizePhMobile(raw: string): string | null {
	const trimmed = raw.trim();
	if (/^09\d{9}$/.test(trimmed)) return trimmed;
	if (/^\+639\d{9}$/.test(trimmed)) return `0${trimmed.slice(3)}`;
	return null;
}

export async function sendSms(
	number: string,
	message: string
): Promise<{ ok: true } | { ok: false; error: string }> {
	try {
		const res = await fetch("https://api.semaphore.co/api/v4/messages", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				apikey: env.SEMAPHORE_API_KEY,
				number,
				message,
				sendername: "fiix",
			}),
		});
		if (!res.ok) {
			const detail = await res.text().catch(() => "");
			return { ok: false, error: `Semaphore ${res.status}: ${detail}` };
		}
		return { ok: true };
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : String(err) };
	}
}

/**
 * Sends to every active recipient. Numbers are normalized and deduplicated
 * first — two recipient rows (or one row saved twice in different formats)
 * pointing at the same physical phone must still produce exactly one text,
 * not one per row. Failures are collected rather than thrown — one bad
 * number should not stop the others (or fail the Time In request itself,
 * which must succeed regardless of SMS delivery).
 */
export async function sendSmsToRecipients(
	numbers: string[],
	message: string
): Promise<{ sent: number; failed: number }> {
	const uniqueNumbers = [
		...new Set(
			numbers
				.map((n) => normalizePhMobile(n))
				.filter((n): n is string => n != null)
		),
	];
	const results = await Promise.all(uniqueNumbers.map((n) => sendSms(n, message)));
	const sent = results.filter((r) => r.ok).length;
	return { sent, failed: results.length - sent };
}

/**
 * Phone numbers for every active SMS recipient, sourced live from
 * users.contactNo (not a manually-typed number) and filtered to
 * Admin/Scheduler — extracted from app/api/attendance/time-in/route.ts's
 * original inline query so the GPS-off alert doesn't grow a second,
 * silently-divergent copy of the same rule. Filtered here even though
 * smsRecipients only ever links those roles at creation time, because a
 * linked user's role can change afterward; this is the authoritative
 * check, not the linkage alone.
 */
export async function getActiveSmsRecipientNumbers(): Promise<string[]> {
	const recipients = await db
		.select({ contactNo: users.contactNo })
		.from(smsRecipients)
		.innerJoin(users, eq(users.id, smsRecipients.userId))
		.where(
			and(
				eq(smsRecipients.isActive, true),
				inArray(users.role, ["Admin", "Scheduler"]),
				isNotNull(users.contactNo)
			)
		);
	return recipients
		.map((r) => r.contactNo)
		.filter((n): n is string => n != null);
}
