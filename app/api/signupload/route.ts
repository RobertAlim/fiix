import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const r2 = new S3Client({
	region: "auto",
	endpoint: process.env.endpoint ?? "",
	credentials: {
		accessKeyId: process.env.accessKeyId ?? "",
		secretAccessKey: process.env.secretAccessKey ?? "",
	},
});

export const POST = async (req: NextRequest) => {
	const formData = await req.formData();
	const file: File = formData.get("file") as File;
	const bytes = await file.arrayBuffer();
	const buffer = Buffer.from(bytes);

	const putObjectCommand = new PutObjectCommand({
		Bucket: process.env.bucketName ?? "",
		Key: file.name,
		Body: buffer,
	});

	try {
		const response = await r2.send(putObjectCommand);
		const signUrl = file.name; //`${process.env.endpoint}/${process.env.bucketName}/${file.name}`;
		console.log(
			"File uploaded successfully to Cloudflare R2 Storage:",
			response
		);
		return NextResponse.json({
			message: "File uploaded successfully",
			response,
			imageUrl: signUrl,
		});
	} catch (error) {
		console.error("Error uploading file:", error);
		return NextResponse.json(
			{ message: "File upload failed", error },
			{ status: 500 }
		);
	}
};
