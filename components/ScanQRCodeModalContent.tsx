"use client";

import { useEffect, useState } from "react";
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
	const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
	const [selectedDeviceId, setSelectedDeviceId] = useState<string>();
	// const [textToEncode, setTextToEncode] = useState("");
	// const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

	// Fetch available video input devices (cameras)
	useEffect(() => {
		navigator.mediaDevices.enumerateDevices().then((allDevices) => {
			const videoInputs = allDevices.filter((d) => d.kind === "videoinput");
			setDevices(videoInputs);
			if (videoInputs.length > 0) {
				setSelectedDeviceId(videoInputs[0].deviceId);
			}
		});
	}, []);

	const handleOnScan = (detected: IDetectedBarcode[]) => {
		if (detected.length > 0) {
			onScan(detected[0].rawValue);
			onClose();
		}
	};

	// const generateQRCode = async () => {
	// 	try {
	// 		const url = await QRCode.toDataURL(textToEncode, {
	// 			errorCorrectionLevel: "H",
	// 			margin: 2,
	// 			scale: 8,
	// 		});
	// 		setQrCodeUrl(url);
	// 	} catch (err) {
	// 		console.error("QR Generation Error:", err);
	// 	}
	// };

	return (
		<div className="relative w-full max-h-full overflow-hidden rounded-lg border">
			{/* Camera selection */}
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
				<div className="relative w-full max-h-[400px] overflow-hidden rounded-lg border">
					<Scanner
						onScan={handleOnScan}
						onError={(err) => console.error("Scanner Error:", err)}
						constraints={{
							deviceId: selectedDeviceId,
						}}
						classNames={{
							container: "relative z-10 w-full h-full object-cover",
						}}
					/>
				</div>
			)}

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

			{/* Close Button */}
			<button
				onClick={onClose}
				className="mt-4 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
			>
				Close
			</button>
		</div>
	);
};
