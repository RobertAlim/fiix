"use client";
import { useState, useCallback } from "react";
import dynamic from "next/dynamic";

const Scanner = dynamic(
	() => import("@yudiel/react-qr-scanner").then((m) => m.Scanner),
	{ ssr: false }
);

export default function QrWithPermission() {
	const [ready, setReady] = useState(false);
	const [deviceId, setDeviceId] = useState<string | undefined>();

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
			setDeviceId(cams[0]?.deviceId); // you can also present a dropdown
			setReady(true);
		} catch (e: any) {
			// Names you might see: NotAllowedError, NotFoundError, NotReadableError, OverconstrainedError
			console.error("Camera permission failed:", e);
			alert(`Camera permission failed: ${e?.name ?? e}`);
		}
	}, []);

	return (
		<div className="p-6 max-w-xl mx-auto space-y-4">
			{!ready && (
				<button
					onClick={requestCamera}
					className="rounded bg-blue-600 px-4 py-2 text-white"
				>
					Enable camera
				</button>
			)}

			{ready && (
				<Scanner
					onScan={(codes) => {
						/* handle codes */
					}}
					onError={(err) => console.error("Scanner error:", err)}
					constraints={
						deviceId
							? { deviceId: { exact: deviceId } } // if we have a device id
							: { facingMode: { ideal: "environment" } } // fallback (iOS)
					}
					allowMultiple
				/>
			)}
		</div>
	);
}
