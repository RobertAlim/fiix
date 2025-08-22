"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { type IDetectedBarcode } from "@yudiel/react-qr-scanner";

// Dynamically import Scanner to avoid SSR errors
const Scanner = dynamic(
	() => import("@yudiel/react-qr-scanner").then((mod) => mod.Scanner),
	{ ssr: false }
);

type Props = {
	callingPage?: string;
	onScan: (value: string) => void;
	onClose: () => void;
};

export const ScanQRCodeModalContent = ({ onScan, onClose }: Props) => {
	const [selectedDeviceId, setSelectedDeviceId] = useState<
		string | undefined
	>();

	const requestCamera = useCallback(async () => {
		try {
			if (!isSecureContext || !navigator.mediaDevices?.getUserMedia) {
				alert("Camera requires HTTPS and a modern browser.");
				return;
			}

			// 1) Ask for permission (this is what shows the system prompt)
			const stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: { ideal: "environment" } },
				audio: false,
			});

			// (Optional) immediately stop the temp stream; the scanner will open its own
			stream.getTracks().forEach((t) => t.stop());

			// 2) Enumerate devices now that permission is granted
			const all = await navigator.mediaDevices.enumerateDevices();
			const cams = all.filter((d) => d.kind === "videoinput");
			setSelectedDeviceId(cams[0]?.deviceId);
		} catch (e: any) {
			// Names you might see: NotAllowedError, NotFoundError, NotReadableError, OverconstrainedError
			console.error("Camera permission failed:", e);
			alert(`Camera permission failed: ${e?.name ?? e}`);
		}
	}, []);

	// Optional: auto-init if permission already granted on revisit
	useEffect(() => {
		// navigator.permissions?.query({ name: "camera" as PermissionName }).then(...)
	}, [requestCamera]);

	const handleOnScan = (detected: IDetectedBarcode[]) => {
		if (detected.length > 0) {
			onScan(detected[0].rawValue);
			onClose();
		}
	};

	return (
		<div className="relative w-full max-h-full overflow-hidden rounded-lg border">
			{/* QR Scanner */}
			<div className="flex flex-col">
				<Scanner
					onScan={handleOnScan}
					onError={(err) => console.error("Scanner Error:", err)}
					constraints={
						selectedDeviceId
							? { deviceId: { exact: selectedDeviceId } }
							: { facingMode: { ideal: "environment" } }
					}
				/>
				{/* Close Button */}
				<button
					onClick={onClose}
					className="mt-4 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
				>
					Close
				</button>
			</div>

			{/* Generator */}
			{/* <div className="space-y-4 border-t pt-4">
				<h2 className="text-lg font-semibold">Generate QR Code</h2>
				<input
					type="text"
					value={textToEncode}
					onChange={(e) => setTextToEncode(e.target.value)}
					className="w-full p-2 border border-gray-300 rounded"
					placeholder="Enter text to encode..."
				/>
				<button
					onClick={generateQRCode}
					className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
				>
					Generate QR
				</button>

				{qrCodeUrl && (
					<div className="mt-4">
						<img src={qrCodeUrl} alt="Generated QR Code" />
						<p className="text-sm text-gray-600 mt-1">🔗 {textToEncode}</p>
					</div>
				)}
			</div> */}
		</div>
	);
};
