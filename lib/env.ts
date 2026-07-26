// lib/env.ts
// Centralized, validated access to server environment variables.
// Import `env` from here instead of reading process.env directly so the app
// fails fast at startup with a clear message instead of crashing mid-request.
import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
	DATABASE_URL: z.string().url({ message: "DATABASE_URL must be a valid URL" }),
	CLERK_SECRET_KEY: z.string().min(1, "CLERK_SECRET_KEY is required"),
	CLERK_WEBHOOK_SIGNING_SECRET: z
		.string()
		.min(1, "CLERK_WEBHOOK_SIGNING_SECRET is required"),
	SEMAPHORE_API_KEY: z.string().min(1, "SEMAPHORE_API_KEY is required"),

	// Cloudflare R2 (NOTE: consider renaming these to R2_* uppercase in Vercel;
	// current lowercase names are kept for backwards compatibility)
	AccountId: z.string().min(1, "AccountId (R2 account id) is required"),
	accessKeyId: z.string().min(1, "accessKeyId (R2 access key) is required"),
	secretAccessKey: z
		.string()
		.min(1, "secretAccessKey (R2 secret key) is required"),
	endpoint: z.string().url({ message: "endpoint (R2 endpoint) must be a URL" }),
	bucketName: z.string().min(1, "bucketName (R2 default bucket) is required"),

	// Reverse geocoding (offline-first GPS pipeline). Optional — defaults to
	// OpenStreetMap Nominatim; set both when switching to a paid provider.
	GEOCODER_BASE_URL: z
		.string()
		.url({ message: "GEOCODER_BASE_URL must be a URL" })
		.optional(),
	GEOCODER_USER_AGENT: z.string().min(1).optional(),
});

const parsed = serverEnvSchema.safeParse(process.env);

if (!parsed.success) {
	const issues = parsed.error.issues
		.map((i) => `  - ${i.path.join(".")}: ${i.message}`)
		.join("\n");
	throw new Error(`Invalid server environment configuration:\n${issues}`);
}

export const env = parsed.data;
