// app/api/get-upload-url/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { getSignedUrlForUpload } from "@/lib/r2";

const bodySchema = z.object({
	key: z.string().min(1).max(512),
	contentType: z.string().min(1).max(100),
	bucketName: z.string().min(1).max(63),
});

export async function POST(request: Request) {
	const { userId } = await auth();
	if (!userId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const parsed = bodySchema.safeParse(await request.json());
		if (!parsed.success) {
			return NextResponse.json(
				{ error: "Missing or invalid key, contentType, or bucketName" },
				{ status: 400 }
			);
		}

		const { key, contentType, bucketName } = parsed.data;
		const signedUrl = await getSignedUrlForUpload(key, contentType, bucketName);
		// NOTE: never log the signed URL — it is a temporary write credential.
		return NextResponse.json({ url: signedUrl });
	} catch (error) {
		const message = error instanceof Error ? error.message : "";
		if (
			message === "Bucket not allowed" ||
			message === "Content type not allowed" ||
			message === "Invalid object key"
		) {
			return NextResponse.json({ error: message }, { status: 400 });
		}
		console.error("get-upload-url error:", error);
		return NextResponse.json(
			{ error: "Internal Server Error" },
			{ status: 500 }
		);
	}
}
