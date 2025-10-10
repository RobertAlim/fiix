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

const MAX_IMAGE_WIDTH = 1920; // Maximum width for optimized image
const MAX_IMAGE_HEIGHT = 1920; // Maximum height for optimized image
const JPEG_QUALITY = 0.8; // JPEG quality (0.0 to 1.0)

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
	const [isOptimizing, setIsOptimizing] = useState(false);

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
		startCamera();

		// Only try to start the camera if we don't have a captured photo
		if (!photoBlob) {
			startCamera();
		}

		// Clean up
		return () => {
			if (stream) {
				stream.getTracks().forEach((track) => track.stop());
			}
			// Stop the stream if it was set when we exit
			if (stream) {
				stream.getTracks().forEach((track) => track.stop());
				setStream(null);
			}
		};
	}, [photoBlob]); // Re-run effect when photoBlob changes (e.g., when resetting from parent)

	// 🚩 NEW: Image Optimization Function
	const processAndOptimizeImage = useCallback(async (originalBlob: Blob) => {
		setIsOptimizing(true);
		setStatusMessage("Optimizing image size...");
		return new Promise<Blob | null>((resolve) => {
			const img = new Image();
			img.src = URL.createObjectURL(originalBlob);

			img.onload = () => {
				if (!canvasRef.current) {
					resolve(null);
					return;
				}
				const canvas = canvasRef.current;
				const context = canvas.getContext("2d");
				if (!context) {
					resolve(null);
					return;
				}

				let width = img.width;
				let height = img.height;

				// Step 1: Resize if too large
				if (width > MAX_IMAGE_WIDTH || height > MAX_IMAGE_HEIGHT) {
					const ratio = Math.min(
						MAX_IMAGE_WIDTH / width,
						MAX_IMAGE_HEIGHT / height
					);
					width *= ratio;
					height *= ratio;
				}

				canvas.width = width;
				canvas.height = height;

				context.clearRect(0, 0, canvas.width, canvas.height);
				context.drawImage(img, 0, 0, width, height);

				// Step 2: Compress (to JPEG with specified quality)
				canvas.toBlob(
					(optimizedBlob) => {
						setIsOptimizing(false);
						URL.revokeObjectURL(img.src); // Clean up
						resolve(optimizedBlob);
					},
					"image/jpeg", // Output format
					JPEG_QUALITY // Compression quality
				);
			};
			img.onerror = () => {
				setIsOptimizing(false);
				URL.revokeObjectURL(img.src);
				setStatusMessage("Error loading image for optimization.");
				resolve(null);
			};
		});
	}, []); // No dependencies needed for this utility function

	const capturePhoto = async () => {
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

		// Get the raw captured blob first
		canvas.toBlob(
			async (rawBlob) => {
				// 👈 Changed to async
				if (rawBlob) {
					const optimizedBlob = await processAndOptimizeImage(rawBlob); // 🚩 OPTIMIZE HERE
					if (optimizedBlob) {
						onCapture(optimizedBlob);
						setStatusMessage("Photo captured and optimized! Ready for saving.");
					} else {
						setStatusMessage("Failed to optimize captured image.");
					}
				} else {
					setStatusMessage("Failed to convert canvas to image.");
				}
			},
			"image/jpeg",
			1.0
		); // Capture at highest quality first, then optimize
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
			reader.onload = async (e) => {
				const img = new Image();
				img.onload = async () => {
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

						// Get the raw captured blob first
						canvas.toBlob(
							async (rawBlob) => {
								// 👈 Changed to async
								if (rawBlob) {
									const optimizedBlob = await processAndOptimizeImage(rawBlob); // 🚩 OPTIMIZE HERE
									if (optimizedBlob) {
										onCapture(optimizedBlob);
										setStatusMessage(
											"Image loaded and optimized from gallery. Ready for saving."
										);
									} else {
										setStatusMessage("Failed to optimize gallery image.");
									}
								} else {
									setStatusMessage(
										"Error loading image from gallery for processing."
									);
								}
							},
							"image/jpeg",
							1.0
						); // Capture at highest quality first, then optimize
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
				disabled={!isCaptureReady || isGalleryImage || isOptimizing}
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
					className={`w-full h-full object-cover absolute top-0 left-0 ${
						photoBlob || isGalleryImage ? "hidden" : ""
					}`}
					autoPlay
					playsInline
					muted
				/>
			</div>
			<div
				className={`border border-gray-400 rounded-lg overflow-hidden w-full max-w-md relative aspect-video ${
					!photoBlob && !isGalleryImage ? "hidden" : ""
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
							disabled={!isCaptureReady || isGalleryImage || isOptimizing}
							className="px-4 py-2 bg-blue-500 text-white rounded transition disabled:bg-gray-400 disabled:cursor-not-allowed hover:bg-blue-600"
						>
							{isOptimizing
								? "Optimizing..."
								: isCaptureReady
								? "Capture Photo"
								: "Loading Camera..."}
						</button>
						{/* 🚩 NEW: Manual Upload Button */}
						<input
							type="file"
							accept="image/*" // Allow all image types
							ref={fileInputRef}
							onChange={handleFileChange}
							style={{ display: "none" }} // Hide the actual input
							disabled={isOptimizing}
						/>
						<button
							onClick={() => fileInputRef.current?.click()} // Trigger hidden input click
							disabled={isOptimizing}
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
							disabled={isOptimizing}
							className="px-4 py-2 bg-yellow-600 text-white rounded transition disabled:bg-gray-400 disabled:cursor-not-allowed hover:bg-yellow-700"
						>
							Retake Photo
						</button>
					</>
				)}

				<button
					onClick={onClose}
					disabled={isOptimizing}
					className="px-4 py-2 rounded bg-red-600 hover:bg-red-700 text-white"
				>
					{isOptimizing ? "Optimizing..." : "Confirm & Close"}
				</button>
			</div>
			{statusMessage && (
				<p
					className={`mt-4 text-center ${
						statusMessage.includes("ready") ||
						statusMessage.includes("captured") ||
						statusMessage.includes("loaded") ||
						statusMessage.includes("optimized")
							? "text-green-600"
							: "text-red-600"
					}`}
				>
					{statusMessage}
				</p>
			)}
		</div>
	);
}
