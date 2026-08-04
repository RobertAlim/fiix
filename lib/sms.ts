// lib/sms.ts
// Thin wrapper around the Semaphore SMS API, factored out of the OTP route
// so the Time In notification can send a plain message through the same
// account rather than duplicating the fetch call.
import { env } from "@/lib/env";

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
 * Sends to every active recipient. Failures are collected rather than
 * thrown — one bad number should not stop the others (or fail the Time In
 * request itself, which must succeed regardless of SMS delivery).
 */
export async function sendSmsToRecipients(
	numbers: string[],
	message: string
): Promise<{ sent: number; failed: number }> {
	const results = await Promise.all(numbers.map((n) => sendSms(n, message)));
	const sent = results.filter((r) => r.ok).length;
	return { sent, failed: results.length - sent };
}
