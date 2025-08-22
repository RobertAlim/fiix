"use client";

import { useEffect, useState, Suspense, useCallback, useRef } from "react";
import QRCode from "qrcode";
import { useSearchParams, useRouter } from "next/navigation";
import { capitalCase } from "change-case";
import { Replace, Wrench } from "lucide-react";
import type { IDetectedBarcode } from "@yudiel/react-qr-scanner";
import { Scanner } from "@yudiel/react-qr-scanner";
import { ensureError } from "@/lib/errors";

export default function ScanQRPage() {
	return (
		<Suspense fallback={<div className="p-4">Loading scanner…</div>}>
			<ScanQRPageContent />
		</Suspense>
	);
}

function ScanQRPageContent() {
	const searchParams = useSearchParams();
	const callingPage = searchParams.get("callingPage"); // e.g., "service-unit"
	const router = useRouter();

	const [mounted, setMounted] = useState(false);
	const [decoded, setDecoded] = useState<string | null>(null);
	const [deviceId, setDeviceId] = useState<MediaDeviceInfo[]>([]);
	const [selectedDeviceId, setSelectedDeviceId] = useState<
		string | undefined
	>();
	const [textToEncode, setTextToEncode] = useState("");
	const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
	const [ready, setReady] = useState(false); // mount scanner only after user action
	const scanningLocked = useRef(false); // avoid multiple pushes

	const IconComponent = callingPage === "replacement" ? Replace : Wrench;

	useEffect(() => {
		setMounted(true);
		if (callingPage) {
			alert("Here is the requestCamera");
			console.log("Called from page:", callingPage);
		}
	}, [callingPage]);

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
			setDeviceId(cams); // you can also present a dropdown
			setSelectedDeviceId(cams[0]?.deviceId);
			setReady(true);
		} catch (error: any) {
			const err = ensureError(error);
			// Names you might see: NotAllowedError, NotFoundError, NotReadableError, OverconstrainedError
			console.error("Camera permission failed:", err);
		}
	}, []);

	const handleOnScan = (detected: IDetectedBarcode[]) => {
		if (scanningLocked.current) return;
		if (detected.length > 0) {
			const value = detected[0].rawValue;
			setDecoded(value);
			scanningLocked.current = true;
			router.push(
				`/dashboard?activePage=${callingPage ?? ""}&scanned=${value}`
			);
		}
	};

	const generateQRCode = async () => {
		try {
			const url = await QRCode.toDataURL(textToEncode, {
				errorCorrectionLevel: "H",
				margin: 2,
				scale: 8,
			});
			setQrCodeUrl(url);
		} catch (err) {
			console.error("QR Generation Error:", err);
		}
	};

	if (!mounted) return null;

	return (
		<div className="p-6 max-w-xl mx-auto space-y-6">
			<div>
				<h1 className="text-2xl font-bold">
					QR Code Scanner for {capitalCase(callingPage ?? "Unknown")}
				</h1>
				<IconComponent className="w-10 h-10 text-green-400" />
			</div>

			{!ready && (
				<button
					className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
					onClick={requestCamera}
				>
					Start camera
				</button>
			)}

			{/* Camera selection dropdown (only if multiple cameras discovered) */}
			{deviceId.length > 0 && (
				<div className="space-y-1">
					<label className="font-semibold">Select Camera:</label>
					<select
						className="w-full p-2 border border-gray-300 rounded"
						value={selectedDeviceId}
						onChange={(e) => setSelectedDeviceId(e.target.value)}
					>
						{deviceId.map((device, index) => (
							<option key={device.deviceId} value={device.deviceId}>
								{device.label || `CameraS ${index + 1}`}
							</option>
						))}
					</select>
				</div>
			)}

			{/* QR Scanner */}
			<Scanner onScan={handleOnScan} />
			{/* {ready && (
				<Scanner
					onScan={handleOnScan}
					onError={(err) => console.error("Scanner Error:", err)}
					constraints={constraints}
					allowMultiple
				/>
			)} */}

			{/* Display decoded value */}
			{decoded && (
				<p className="text-green-600 font-mono">
					✅ Decoded: <strong>{decoded}</strong>
				</p>
			)}

			<hr />

			{/* QR Generator Section */}
			<div className="space-y-4">
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
						{/* Use a plain img or set explicit width/height on next/image */}
						<img
							src={qrCodeUrl}
							alt="Generated QR Code"
							width={256}
							height={256}
						/>
						<p className="text-sm text-gray-600 mt-1">🔗 {textToEncode}</p>
					</div>
				)}
			</div>
		</div>
	);
}
