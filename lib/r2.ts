// lib/r2.ts
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import "server-only";

// Ensure all environment variables are defined
const { AccountId, accessKeyId, secretAccessKey, endpoint } = process.env;

if (!AccountId || !accessKeyId || !secretAccessKey || !endpoint) {
	throw new Error("Missing Cloudflare R2 environment variables");
}

const S3 = new S3Client({
	region: "auto",
	endpoint: endpoint,
	credentials: {
		accessKeyId: accessKeyId,
		secretAccessKey: secretAccessKey,
	},
});

/**
 * Generates a presigned URL for a secure upload to Cloudflare R2.
 * @param key The desired key (filename and path) for the object in the R2 bucket.
 * @param contentType The MIME type of the file to be uploaded.
 * @returns The presigned URL as a string.
 */
export async function getSignedUrlForUpload(
	key: string,
	contentType: string,
	bucketName: string
): Promise<string> {
	const command = new PutObjectCommand({
		Bucket: bucketName,
		Key: key,
		ContentType: contentType,
	});

	try {
		const signedUrl = await getSignedUrl(S3, command, { expiresIn: 3600 }); // URL expires in 1 hour
		return signedUrl;
	} catch (error) {
		console.error("Error generating signed URL:", error);
		throw new Error("Failed to generate signed URL");
	}
}
