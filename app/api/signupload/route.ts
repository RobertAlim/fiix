import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import {
	r2Client,
	sanitizeObjectKey,
	ALLOWED_UPLOAD_CONTENT_TYPES,
} from "@/lib/r2";
import { env } from "@/lib/env";
import { randomUUID } from "crypto";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export const POST = async (req: NextRequest) => {
	const { userId } = await auth();
	if (!userId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const formData = await req.formData();
	const file = formData.get("file");

	if (!(file instanceof File)) {
		return NextResponse.json({ message: "No file provided" }, { status: 400 });
	}
	if (file.size > MAX_FILE_BYTES) {
		return NextResponse.json(
			{ message: "File too large (max 5 MB)" },
			{ status: 413 }
		);
	}
	if (!ALLOWED_UPLOAD_CONTENT_TYPES.has(file.type)) {
		return NextResponse.json(
			{ message: "File type not allowed" },
			{ status: 415 }
		);
	}

	// Preserve the original (sanitized) name but prefix with a UUID so uploads
	// can never overwrite each other or an existing object.
	const safeName = sanitizeObjectKey(file.name) ?? "upload";
	const key = `${randomUUID()}-${safeName}`;

	const bytes = await file.arrayBuffer();
	const buffer = Buffer.from(bytes);

	try {
		await r2Client.send(
			new PutObjectCommand({
				Bucket: env.bucketName,
				Key: key,
				Body: buffer,
				ContentType: file.type,
			})
		);
		return NextResponse.json({
			message: "File uploaded successfully",
			imageUrl: key,
		});
	} catch (error) {
		console.error("signupload error:", error);
		return NextResponse.json({ message: "File upload failed" }, { status: 500 });
	}
};
