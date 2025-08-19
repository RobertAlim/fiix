"use client";

import { useEffect, useState, Suspense, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import QRCode from "qrcode";
import { useSearchParams, useRouter } from "next/navigation";
import { capitalCase } from "change-case";
import { Replace, Wrench } from "lucide-react";
import type { IDetectedBarcode } from "@yudiel/react-qr-scanner";

// Dynamically import Scanner to avoid SSR errors
const Scanner = dynamic(
	() => import("@yudiel/react-qr-scanner").then((mod) => mod.Scanner),
	{ ssr: false }
);

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
	const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
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
			console.log("Called from page:", callingPage);
		}
	}, [callingPage]);

	const initCameras = useCallback(async () => {
		try {
			if (!isSecureContext || !navigator.mediaDevices?.getUserMedia) {
				throw new Error("Camera requires HTTPS and a modern browser.");
			}

			// 1) Ask for permission first
			await navigator.mediaDevices.getUserMedia({ video: true, audio: false });

			// 2) Now enumerate devices (reliable after permission on iOS)
			const all = await navigator.mediaDevices.enumerateDevices();
			const cams = all.filter((d) => d.kind === "videoinput");
			setDevices(cams);
			setSelectedDeviceId(cams[0]?.deviceId);
			setReady(true);
		} catch (err) {
			console.error("Camera init failed:", err);
			alert(
				"Unable to access the camera. Please check browser permissions and try again."
			);
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

	// Build constraints: use selected device if available, otherwise prefer back camera
	const constraints: MediaTrackConstraints = selectedDeviceId
		? { deviceId: { exact: selectedDeviceId } }
		: { facingMode: { ideal: "environment" } };

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
					onClick={initCameras}
				>
					Start camera
				</button>
			)}

			{/* Camera selection dropdown (only if multiple cameras discovered) */}
			{devices.length > 0 && (
				<div className="space-y-1">
					<label className="font-semibold">Select Camera:</label>
					<select
						className="w-full p-2 border border-gray-300 rounded"
						value={selectedDeviceId}
						onChange={(e) => setSelectedDeviceId(e.target.value)}
					>
						{devices.map((device, index) => (
							<option key={device.deviceId} value={device.deviceId}>
								{device.label || `Camera ${index + 1}`}
							</option>
						))}
					</select>
				</div>
			)}

			{/* QR Scanner */}
			{ready && (
				<Scanner
					onScan={handleOnScan}
					onError={(err) => console.error("Scanner Error:", err)}
					constraints={constraints}
					allowMultiple
				/>
			)}

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
