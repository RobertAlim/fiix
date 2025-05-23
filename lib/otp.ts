// /lib/otp.ts
const OTP_STORE = new Map<string, { otp: string; expiresAt: number }>();

export function generateOtp(): string {
	return Math.floor(100000 + Math.random() * 900000).toString();
}

export function storeOtp(phone: string, otp: string) {
	OTP_STORE.set(phone, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });
}

export function verifyOtp(phone: string, code: string): boolean {
	const entry = OTP_STORE.get(phone);
	if (!entry) return false;
	if (Date.now() > entry.expiresAt) return false;
	return entry.otp === code;
}

export async function sendOtp(phone: string, otp: string) {
	const message = `Your OTP code is ${otp}`;

	const params = new URLSearchParams();
	params.append("1", phone);
	params.append("2", message);
	params.append("3", process.env.ITEXMO_API_KEY!);

	const response = await fetch("https://www.itexmo.com/php_api/api.php", {
		method: "POST",
		body: params,
	});

	const result = await response.text();
	return result === "0";
}
