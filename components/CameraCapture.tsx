// components/CameraCapture.tsx
"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { SwitchCamera } from "lucide-react";

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

type FacingMode = "user" | "environment";

export function CameraCapture({
	onCapture,
	onRetake,
	capturedBlob,
	onClose,
}: CameraCaptureProps) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null); // 👈 NEW: Ref for file input

	const [stream, setStream] = useState<MediaStream | null>(null);
	const [statusMessage, setStatusMessage] = useState("");
	const [isCaptureReady, setIsCaptureReady] = useState(false);
	const [facingMode, setFacingMode] = useState<FacingMode>("environment");

	// NEW STATE: To know if we are showing a gallery image instead of camera feed
	const [isGalleryImage, setIsGalleryImage] = useState(false);

	// Use capturedBlob from props to determine if we are in capture mode or display mode
	const photoBlob = capturedBlob;

	const stopCamera = useCallback(() => {
		if (stream) {
			stream.getTracks().forEach((track) => track.stop());
			setStream(null);
		}
		setIsCaptureReady(false);
	}, [stream]);

	const startCamera = useCallback(async () => {
		// Only start camera if no photo is captured AND we're not showing a gallery image
		if (photoBlob || isGalleryImage) return;

		stopCamera();

		try {
			const mediaStream = await navigator.mediaDevices.getUserMedia({
				video: {
					facingMode: facingMode,
				},
			});
			setStream(mediaStream);
			setStatusMessage(
				`Starting ${facingMode === "user" ? "Front" : "Back"} camera...`
			);

			if (videoRef.current) {
				videoRef.current.srcObject = mediaStream;

				videoRef.current.onloadedmetadata = () => {
					if (videoRef.current && canvasRef.current) {
						canvasRef.current.width = videoRef.current.videoWidth;
						canvasRef.current.height = videoRef.current.videoHeight;

						setIsCaptureReady(true);
						setStatusMessage(
							`${facingMode === "user" ? "Front" : "Back"} camera feed ready.`
						);
					}
				};
			}
		} catch (err) {
			console.error("Error accessing camera:", err);
			if (facingMode === "environment") {
				setStatusMessage("Back camera failed. Trying front camera...");
				setFacingMode("user");
				return;
			}
			setStatusMessage(
				"Failed to access camera. Check permissions and try again."
			);
			setIsCaptureReady(false);
		}
	}, [photoBlob, facingMode, stopCamera, isGalleryImage]); // Depend on isGalleryImage

	// 1. Initialize Camera and Check Ref Readiness
	useEffect(() => {
		let mediaStream: MediaStream | null = null;
		let timeoutId: NodeJS.Timeout;

		async function startCamera() {
			try {
				// Request camera access only if we aren't displaying a captured photo
				mediaStream = await navigator.mediaDevices.getUserMedia({
					video: { facingMode: { ideal: "environment" } },
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

		const video = videoRef.current;
		const canvas = canvasRef.current;
		const context = canvasRef.current.getContext("2d");
		if (!context) return;

		const videoWidth = video.videoWidth; // e.g., 1280
		const videoHeight = video.videoHeight; // e.g., 720

		// Get the display size from the DOM to match the visual aspect ratio
		// This assumes your CSS container (w-full max-w-md relative aspect-video)
		// is applied to the video element's effective size.
		const displayWidth = video.clientWidth;
		const displayHeight = video.clientHeight;

		const videoRatio = videoWidth / videoHeight;
		const displayRatio = displayWidth / displayHeight; // Should be 16/9 = 1.777...

		let sourceX = 0;
		let sourceY = 0;
		let sourceWidth = videoWidth;
		let sourceHeight = videoHeight;

		// Set the canvas size to match the visual aspect ratio of the displayed frame,
		// while keeping the captured resolution as high as possible.
		// We'll use the videoHeight as the base for a high-res capture.
		canvas.height = videoHeight;
		canvas.width = Math.round(videoHeight * displayRatio); // e.g., 720 * 1.777... = 1280

		// Determine if we need to crop the video source horizontally or vertically
		if (videoRatio > displayRatio) {
			// Video is wider than the container (Horizontal crop needed)
			sourceWidth = videoHeight * displayRatio;
			sourceX = (videoWidth - sourceWidth) / 2;
		} else if (videoRatio < displayRatio) {
			// Video is taller than the container (Vertical crop needed)
			sourceHeight = videoWidth / displayRatio;
			sourceY = (videoHeight - sourceHeight) / 2;
		}

		// Capture logic: Draw the calculated source area onto the full canvas area
		context.drawImage(
			video,
			sourceX, // Source X (Crop offset)
			sourceY, // Source Y (Crop offset)
			sourceWidth, // Source Width (The cropped width)
			sourceHeight, // Source Height (The cropped height)
			0, // Destination X (Draw from top-left of canvas)
			0, // Destination Y
			canvas.width, // Destination Width (Full canvas width)
			canvas.height // Destination Height (Full canvas height)
		);

		// Convert and send the Blob to the parent
		canvas.toBlob(
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

	const toggleCamera = () => {
		setFacingMode((prevMode) =>
			prevMode === "environment" ? "user" : "environment"
		);
	};

	// 🚩 NEW: Handler for manual file selection
	const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (file && file.type.startsWith("image/")) {
			stopCamera(); // Stop camera if it's running
			setIsCaptureReady(false); // No live camera feed
			setIsGalleryImage(true); // Indicate we are showing a gallery image

			const reader = new FileReader();
			reader.onload = (e) => {
				const img = new Image();
				img.onload = () => {
					if (canvasRef.current) {
						const canvas = canvasRef.current;
						const context = canvas.getContext("2d");
						if (!context) return;

						// Set canvas dimensions to match the image aspect ratio within the display container's aspect
						// We target a resolution to keep the file size reasonable while preserving aspect ratio
						const MAX_PREVIEW_WIDTH = 1280;
						const MAX_PREVIEW_HEIGHT = 720; // Example target resolution

						let width = img.width;
						let height = img.height;

						if (width > height) {
							if (width > MAX_PREVIEW_WIDTH) {
								height *= MAX_PREVIEW_WIDTH / width;
								width = MAX_PREVIEW_WIDTH;
							}
						} else {
							if (height > MAX_PREVIEW_HEIGHT) {
								width *= MAX_PREVIEW_HEIGHT / height;
								height = MAX_PREVIEW_HEIGHT;
							}
						}

						canvas.width = width;
						canvas.height = height;

						context.clearRect(0, 0, canvas.width, canvas.height); // Clear previous drawings
						context.drawImage(img, 0, 0, canvas.width, canvas.height);

						// Convert the drawn image on canvas to a Blob and send to parent
						canvas.toBlob(
							(blob) => {
								if (blob) {
									onCapture(blob);
									setStatusMessage(
										"Image loaded from gallery. Ready for saving."
									);
								} else {
									setStatusMessage("Failed to process gallery image.");
								}
							},
							"image/jpeg",
							0.95
						);
					}
				};
				if (e.target?.result) {
					img.src = e.target.result as string;
				}
			};
			reader.readAsDataURL(file); // Read the selected file as a Data URL
		} else {
			setStatusMessage("Please select a valid image file.");
			if (fileInputRef.current) {
				fileInputRef.current.value = ""; // Clear the input
			}
		}
	};

	return (
		<div className="flex flex-col items-end p-4">
			<Button
				type="button"
				variant={"secondary"}
				onClick={() => {
					toggleCamera();
				}}
				className="ml-1 p-1 rounded-full mb-2"
			>
				<SwitchCamera className="w-5 h-5" />
			</Button>
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
					<>
						<button
							onClick={capturePhoto}
							disabled={!isCaptureReady}
							className="px-4 py-2 bg-blue-500 text-white rounded transition disabled:bg-gray-400 disabled:cursor-not-allowed hover:bg-blue-600"
						>
							{isCaptureReady ? "Capture Photo" : "Loading Camera..."}
						</button>
						{/* 🚩 NEW: Manual Upload Button */}
						<input
							type="file"
							accept="image/*" // Allow all image types
							ref={fileInputRef}
							onChange={handleFileChange}
							style={{ display: "none" }} // Hide the actual input
							// disabled={isProcessing}
						/>
						<button
							onClick={() => fileInputRef.current?.click()} // Trigger hidden input click
							// disabled={isProcessing}
							className="px-4 py-2 bg-purple-500 text-white rounded transition disabled:bg-gray-400 disabled:cursor-not-allowed hover:bg-purple-600"
						>
							Upload from Gallery
						</button>
					</>
				) : (
					// This assumes your CSS container (w-full max-w-md relative aspect-video)

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
