// components/CameraCapture.tsx
"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";

// Define the shape of the component's props
interface CameraCaptureProps {
	// Callback function to send the captured Blob back to the parent
	onCapture: (blob: Blob) => void;
	// Callback function to clear the captured Blob in the parent (for Retake)
	onRetake: () => void; // 👈 NEW: Function to reset the parent's capturedBlob state
	// Prop to display the captured image (read-only from parent)
	capturedBlob: Blob | null;
	onClose: () => void;
}

export function CameraCapture({
	onCapture,
	onRetake,
	capturedBlob,
	onClose,
}: CameraCaptureProps) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [stream, setStream] = useState<MediaStream | null>(null);
	const [statusMessage, setStatusMessage] = useState("");
	const [isCaptureReady, setIsCaptureReady] = useState(false);

	// Use capturedBlob from props to determine if we are in capture mode or display mode
	const photoBlob = capturedBlob;

	// 1. Initialize Camera and Check Ref Readiness
	useEffect(() => {
		let mediaStream: MediaStream | null = null;
		let timeoutId: NodeJS.Timeout;

		async function startCamera() {
			try {
				// Request camera access only if we aren't displaying a captured photo
				mediaStream = await navigator.mediaDevices.getUserMedia({
					video: true,
				});
				setStream(mediaStream);

				if (videoRef.current) {
					videoRef.current.srcObject = mediaStream;

					if (videoRef.current) {
						videoRef.current.srcObject = mediaStream;

						videoRef.current.onloadeddata = () => {
							// Give React time to stabilize refs
							timeoutId = setTimeout(() => {
								if (videoRef.current && canvasRef.current) {
									setIsCaptureReady(true);
									setStatusMessage("Camera feed ready.");
								} else {
									setStatusMessage(
										"Error: Could not find video/canvas elements in DOM."
									);
								}
							}, 100);
						};
					}
				}

				if (!photoBlob) {
					setIsCaptureReady(true); // If we have a photo, we are ready to retake
					setStatusMessage("Photo captured. You can retake or proceed.");
				}
			} catch (err) {
				console.error("Error accessing camera:", err);
				setStatusMessage("Failed to access camera. Please check permissions.");
			}
		}

		// Only try to start the camera if we don't have a captured photo
		if (!photoBlob) {
			startCamera();
		}

		// Clean up
		return () => {
			clearTimeout(timeoutId);
			if (mediaStream) {
				mediaStream.getTracks().forEach((track) => track.stop());
			}
			// Stop the stream if it was set when we exit
			if (stream) {
				stream.getTracks().forEach((track) => track.stop());
				setStream(null);
			}
		};
	}, [photoBlob]); // Re-run effect when photoBlob changes (e.g., when resetting from parent)

	const capturePhoto = () => {
		if (!isCaptureReady || !videoRef.current || !canvasRef.current) {
			setStatusMessage("Capture not ready. Please wait.");
			return;
		}
		if (videoRef.current.readyState < 2) {
			setStatusMessage("Video stream buffer not full. Please wait a second.");
			return;
		}

		const context = canvasRef.current.getContext("2d");
		if (!context) return;

		// Capture logic
		canvasRef.current.width = videoRef.current.videoWidth;
		canvasRef.current.height = videoRef.current.videoHeight;
		context.drawImage(
			videoRef.current,
			0,
			0,
			canvasRef.current.width,
			canvasRef.current.height
		);

		// Convert and send the Blob to the parent
		canvasRef.current.toBlob(
			(blob) => {
				if (blob) {
					onCapture(blob); // <-- KEY CHANGE: Send Blob via prop
					setStatusMessage("Photo captured! Ready for processing.");
				} else {
					setStatusMessage("Failed to convert canvas to image.");
				}
			},
			"image/jpeg",
			0.95
		);
	};

	return (
		<div className="flex flex-col items-center p-4">
			<div
				className={`border border-gray-400 rounded-lg overflow-hidden w-full max-w-md relative aspect-video ${
					photoBlob ? "hidden" : ""
				}`}
			>
				{/* VIDEO element for live feed (hidden when photo is captured) */}
				<video
					ref={videoRef}
					className={`w-full h-full object-cover absolute top-0 left-0`}
					autoPlay
					playsInline
					muted
				/>
			</div>
			<div
				className={`border border-gray-400 rounded-lg overflow-hidden w-full max-w-md relative aspect-video ${
					!photoBlob ? "hidden" : ""
				}`}
			>
				{/* CANVAS element for captured image preview (hidden when live feed is showing) */}
				<canvas
					ref={canvasRef || photoBlob}
					className={`w-full h-full object-cover absolute top-0 left-0`}
				/>
			</div>
			<div className="mt-4 flex gap-4">
				{!photoBlob ? (
					<button
						onClick={capturePhoto}
						disabled={!isCaptureReady}
						className="px-4 py-2 bg-blue-500 text-white rounded transition disabled:bg-gray-400 disabled:cursor-not-allowed hover:bg-blue-600"
					>
						{isCaptureReady ? "Capture Photo" : "Loading Camera..."}
					</button>
				) : (
					// State: Photo Captured/Preview Visible
					<>
						{/* 2. RETAKE BUTTON */}
						<button
							// 🚩 RETAKE IMPLEMENTATION: Clears the captured image state
							onClick={onRetake}
							// disabled={!isCaptureReady || isProcessing}
							className="px-4 py-2 bg-yellow-600 text-white rounded transition disabled:bg-gray-400 disabled:cursor-not-allowed hover:bg-yellow-700"
						>
							Retake Photo
						</button>
					</>
				)}

				<button
					onClick={onClose}
					className="px-4 py-2 rounded bg-red-600 hover:bg-red-700 text-white"
				>
					Close
				</button>
			</div>
			{statusMessage && (
				<p
					className={`mt-4 text-center ${
						statusMessage.includes("ready") ? "text-green-600" : "text-red-600"
					}`}
				>
					{statusMessage}
				</p>
			)}
		</div>
	);
}
