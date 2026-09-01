// lib/r2.ts
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import "server-only";
import { env } from "@/lib/env";

// Single shared R2 client for the whole app (also used by signupload / pdf routes)
export const r2Client = new S3Client({
	region: "auto",
	endpoint: env.endpoint,
	credentials: {
		accessKeyId: env.accessKeyId,
		secretAccessKey: env.secretAccessKey,
	},
});

// Only these buckets may ever be written to via the app.
// Client-supplied bucket names are validated against this list.
// "fiixsupport" — Support Services photo uploads (mobile app), separate
// from "fiixnozzle" (maintenance photos) per the original request's
// explicit bucket split; signatures for both flows still share
// "fiixdrive".
export const ALLOWED_BUCKETS = new Set([
	env.bucketName,
	"fiixdrive",
	"fiixnozzle",
	"fiixsupport",
]);

// Only these MIME types are accepted for uploads (signatures, nozzle photos, PDFs).
export const ALLOWED_UPLOAD_CONTENT_TYPES = new Set([
	"image/png",
	"image/jpeg",
	"image/webp",
	"application/pdf",
]);

/**
 * Sanitizes an object key: strips path traversal and unsafe characters.
 * Returns null if nothing safe remains.
 */
export function sanitizeObjectKey(rawKey: string): string | null {
	const cleaned = rawKey
		.replace(/\\/g, "/")
		.split("/")
		.filter((seg) => seg && seg !== "." && seg !== "..")
		.map((seg) => seg.replace(/[^a-zA-Z0-9._-]/g, "_"))
		.join("/");
	return cleaned.length > 0 && cleaned.length <= 512 ? cleaned : null;
}

/**
 * Generates a presigned URL for a secure upload to Cloudflare R2.
 * Bucket and content type are validated against allowlists; the key is sanitized.
 */
export async function getSignedUrlForUpload(
	key: string,
	contentType: string,
	bucketName: string
): Promise<string> {
	if (!ALLOWED_BUCKETS.has(bucketName)) {
		throw new Error("Bucket not allowed");
	}
	if (!ALLOWED_UPLOAD_CONTENT_TYPES.has(contentType)) {
		throw new Error("Content type not allowed");
	}
	const safeKey = sanitizeObjectKey(key);
	if (!safeKey) {
		throw new Error("Invalid object key");
	}

	const command = new PutObjectCommand({
		Bucket: bucketName,
		Key: safeKey,
		ContentType: contentType,
	});

	// URL expires in 10 minutes — long enough for a mobile upload, short enough
	// to limit misuse if the URL leaks.
	return getSignedUrl(r2Client, command, { expiresIn: 600 });
}
