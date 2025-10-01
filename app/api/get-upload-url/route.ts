// app/api/get-upload-url/route.ts
import { NextResponse } from "next/server";
import { getSignedUrlForUpload } from "@/lib/r2";

interface GetUploadUrlRequestBody {
	key: string;
	contentType: string;
	bucketName: string;
}

export async function POST(request: Request) {
	try {
		const { key, contentType, bucketName }: GetUploadUrlRequestBody =
			await request.json();

		if (!key || !contentType || !bucketName) {
			return NextResponse.json(
				{ error: "Missing key or contentType" },
				{ status: 400 }
			);
		}

		const signedUrl = await getSignedUrlForUpload(key, contentType, bucketName);
		console.log("Generated signed URL:", signedUrl);
		return NextResponse.json({ url: signedUrl });
	} catch (error) {
		console.error("API error:", error);
		return NextResponse.json(
			{ error: "Internal Server Error" },
			{ status: 500 }
		);
	}
}
