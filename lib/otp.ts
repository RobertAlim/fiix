// /lib/otp.ts
export const OTP_STORE = new Map<string, { otp: string; expiresAt: number }>();

export function storeOtp(phone: string, otp: string) {
	OTP_STORE.set(phone, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });
}

export function deleteOtp(otp: string) {
	OTP_STORE.delete(otp);
}

export function getOtp(otp: string): string | null {
	const entry = OTP_STORE.get(otp);

	return entry ? entry.otp : null;
}

export function verifyOtp(phone: string, code: string): boolean {
	const entry = OTP_STORE.get(phone);

	if (!entry) return false;

	if (Date.now() > entry.expiresAt) return false;

	return entry.otp === code;
}
