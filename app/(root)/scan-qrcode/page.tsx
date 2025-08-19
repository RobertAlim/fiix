"use client";

import { useEffect, useState, Suspense, useCallback } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import QRCode from "qrcode";
import { useSearchParams } from "next/navigation";
import { capitalCase } from "change-case";
import { Replace, Wrench } from "lucide-react";
import { useRouter } from "next/navigation"; // Pages Router
import { type IDetectedBarcode } from "@yudiel/react-qr-scanner";

// Dynamically import Scanner to avoid SSR errors
const Scanner = dynamic(
	() => import("@yudiel/react-qr-scanner").then((mod) => mod.Scanner),
	{ ssr: false }
);

export default function ScanQRPage() {
	<Suspense fallback={<div className="p-4">Loading dashboard…</div>}>
		<ScanQRPageContent />
	</Suspense>;
}

function ScanQRPageContent() {
	const searchParams = useSearchParams();
	const callingPage = searchParams.get("callingPage"); // e.g., "service-unit"
	const [decoded, setDecoded] = useState<string | null>(null);
	const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
	const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(
		undefined
	);
	const [textToEncode, setTextToEncode] = useState("");
	const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
	const IconComponent = callingPage === "replacement" ? Replace : Wrench;
	const [ready, setReady] = useState(false); // mount scanner only after user action
	const router = useRouter();

	useEffect(() => {
		if (callingPage) {
			console.log("Called from page:", callingPage);
			// You can now customize behavior depending on where it was triggered
		}
	}, [callingPage]);

	// Fetch available video input devices (cameras)
	// useEffect(() => {
	// 	navigator.mediaDevices.enumerateDevices().then((allDevices) => {
	// 		const videoInputs = allDevices.filter((d) => d.kind === "videoinput");
	// 		setDevices(videoInputs);
	// 		if (videoInputs.length > 0) {
	// 			setSelectedDeviceId(videoInputs[0].deviceId);
	// 		}
	// 	});
	// }, []);

	const initCameras = useCallback(async () => {
		try {
			// 1) Ask for permission first (minimal constraints)
			await navigator.mediaDevices.getUserMedia({ video: true, audio: false });

			// 2) Now enumerate devices (works reliably after permission)
			const all = await navigator.mediaDevices.enumerateDevices();
			const cams = all.filter((d) => d.kind === "videoinput");
			setDevices(cams);
			setSelectedDeviceId(cams[0]?.deviceId);
			setReady(true);
		} catch (err) {
			console.error("Camera init failed:", err);
			// show a toast/alert to the user here
		}
	}, []);

	useEffect(() => {
		// optional: if you want to auto-init on revisit when permission is already granted
		// initCameras();
	}, [initCameras]);

	const handleOnScan = (detected: IDetectedBarcode[]) => {
		if (detected.length > 0) {
			setDecoded(detected[0].rawValue);
			router.push(
				`/dashboard?activePage=${callingPage}&scanned=${detected[0].rawValue}`
			);
		}
	};

	const generateQRCode = async () => {
		try {
			const url = await QRCode.toDataURL(textToEncode, {
				errorCorrectionLevel: "H", // <- set to 'L', 'M', 'Q', or 'H'
				margin: 2,
				scale: 8,
			});
			setQrCodeUrl(url);
		} catch (err) {
			console.error("QR Generation Error:", err);
		}
	};

	return (
		<div className="p-6 max-w-xl mx-auto space-y-6">
			<div>
				<h1 className="text-2xl font-bold">
					QR Code Scanner for {capitalCase(callingPage!)}
				</h1>
				<IconComponent className="w-10 h-10 text-green-400" />
			</div>

			{/* Camera selection dropdown */}
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

			{/* QR Scanner */}
			{selectedDeviceId && (
				<Scanner
					onScan={(detected) => {
						handleOnScan(detected);
					}}
					onError={(err) => console.error("Scanner Error:", err)}
					constraints={{
						deviceId: selectedDeviceId,
					}}
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
						<Image src={qrCodeUrl} alt="Generated QR Code" />
						<p className="text-sm text-gray-600 mt-1">🔗 {textToEncode}</p>
					</div>
				)}
			</div>
		</div>
	);
}
