// components/PrinterQrCodeButton.tsx
//
// Per-row "QR Code" action for the Printers grid (Actions column). Encodes
// the printer's Serial No — nothing else — so each generated code is
// unique to exactly one printer, the same way the Serial No itself already
// uniquely identifies a deployment. Uses the same `qrcode` package and
// `QRCode.toDataURL` call already used for QR generation in
// app/(root)/scan-qrcode/page.tsx, just wrapped in a Popover instead of a
// full page so it can live inline in the grid.
"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import Image from "next/image";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { QrCode, Copy, Check } from "lucide-react";
import { showAppToast } from "@/components/ui/apptoast";

// Rendered at 224x224 in the popover — large enough to fill most of a
// phone camera's frame at a comfortable arm's-length distance, which is
// what "reliable scanning/capturing with a mobile device" calls for.
const DISPLAY_SIZE = 224;

// The actual generated image is a fixed 1024x1024px — well above display
// size, and also what actually gets copied to the clipboard when the Copy
// button is used. Sized for "clear viewing/sharing" once pasted somewhere
// else (a doc, a chat, a printed sheet), not just for the 224px preview
// here, so this one image serves both purposes without regenerating a
// second, higher-res copy specifically for the clipboard.
const IMAGE_PX = 1024;

/** True only when the browser can actually accept an image on the system
 * clipboard via the Clipboard API — Safari, Chrome, and Firefox all
 * support this differently across versions, and some mobile browsers
 * (older Android WebViews in particular) don't expose `ClipboardItem` at
 * all. Checked once per click rather than trusted from a `"use client"`
 * top-level constant, since it depends on the actual runtime, not just
 * whether JS is enabled. */
function supportsImageClipboard(): boolean {
	return (
		typeof navigator !== "undefined" &&
		!!navigator.clipboard &&
		typeof navigator.clipboard.write === "function" &&
		typeof window !== "undefined" &&
		typeof window.ClipboardItem === "function"
	);
}

export function PrinterQrCodeButton({ serialNo }: { serialNo: string }) {
	const [open, setOpen] = useState(false);
	const [dataUrl, setDataUrl] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [justCopied, setJustCopied] = useState(false);

	// Generated on demand (only once the popover is actually opened) rather
	// than eagerly for every row in the grid — a page can list hundreds of
	// printers, and encoding a QR code for every single one up front would
	// be wasted work for the rows nobody ever clicks.
	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		setError(null);
		setJustCopied(false);
		QRCode.toDataURL(serialNo, {
			errorCorrectionLevel: "H",
			margin: 2,
			width: IMAGE_PX,
		})
			.then((url) => {
				if (!cancelled) setDataUrl(url);
			})
			.catch((err) => {
				console.error("QR code generation failed:", err);
				if (!cancelled) setError("Could not generate a QR code for this printer.");
			});
		return () => {
			cancelled = true;
		};
	}, [open, serialNo]);

	const handleCopy = () => {
		if (!dataUrl) return;

		if (!supportsImageClipboard()) {
			// Graceful degradation: no silent failure, and no pretending a
			// text-only fallback (copying just the Serial No., or the QR's
			// encoded text) is the same thing the user asked for — the
			// requirement is specifically an image on the clipboard. Older
			// Safari/iOS and some in-app/WebView browsers land here.
			showAppToast({
				message: "Can't copy image on this browser",
				description:
					"Long-press or right-click the QR code above and choose \"Copy Image\" instead.",
				color: "warning",
				position: "top-right",
			});
			return;
		}

		// Deliberately NOT awaited before calling clipboard.write(): Safari in
		// particular revokes the "user activation" a click handler carries
		// the moment an `await` yields back to the event loop, and a
		// clipboard write attempted after that is rejected outright. Passing
		// a Promise<Blob> as the ClipboardItem's value (part of the spec,
		// supported by every browser that exposes `ClipboardItem` at all)
		// keeps the actual `clipboard.write()` call synchronous inside this
		// click handler while the fetch/blob conversion still happens async
		// underneath it.
		const blobPromise = fetch(dataUrl).then((res) => res.blob());

		navigator.clipboard
			.write([new ClipboardItem({ "image/png": blobPromise })])
			.then(() => {
				setJustCopied(true);
				showAppToast({
					message: "QR Code copied",
					description: `Ready to paste — encodes Serial No. ${serialNo}.`,
					color: "success",
					position: "top-right",
				});
			})
			.catch((err) => {
				console.error("Copying QR code image failed:", err);
				showAppToast({
					message: "Couldn't copy QR Code",
					description: "Please try again, or right-click the image to copy it.",
					color: "error",
					position: "top-right",
				});
			});
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					aria-label={`Show QR code for ${serialNo}`}
					title="Show QR code"
					// The Actions cell that hosts this button already stops
					// propagation on click (see MasterDataManager.tsx), so this
					// isn't strictly load-bearing here — kept anyway since it's
					// the established, safe-by-default pattern for anything
					// that opens a popover from inside a clickable row.
					onClick={(e) => e.stopPropagation()}
				>
					<QrCode className="h-4 w-4 text-primary" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				className="w-auto"
				align="end"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex flex-col items-center gap-3 text-center">
					<p className="text-sm font-medium">{serialNo}</p>

					{error ? (
						<p
							className="flex items-center justify-center text-sm text-destructive"
							style={{ width: DISPLAY_SIZE, height: DISPLAY_SIZE }}
						>
							{error}
						</p>
					) : dataUrl ? (
						// A white backing plate is deliberate, independent of light/
						// dark theme — a QR code needs real light-on-dark contrast
						// to scan reliably, which a dark page background would
						// otherwise undermine.
						<div className="rounded-lg border bg-white p-3">
							<Image
								src={dataUrl}
								alt={`QR code encoding Serial No. ${serialNo}`}
								width={DISPLAY_SIZE}
								height={DISPLAY_SIZE}
								unoptimized
							/>
						</div>
					) : (
						<div
							className="flex items-center justify-center text-sm text-muted-foreground"
							style={{ width: DISPLAY_SIZE, height: DISPLAY_SIZE }}
						>
							Generating…
						</div>
					)}

					<p className="text-xs text-muted-foreground">
						Encodes this printer&apos;s Serial No. — scan to identify it.
					</p>

					<Button
						size="sm"
						variant="outline"
						className="w-full gap-2"
						disabled={!dataUrl}
						onClick={handleCopy}
					>
						{justCopied ? (
							<>
								<Check className="h-4 w-4" />
								Copied
							</>
						) : (
							<>
								<Copy className="h-4 w-4" />
								Copy
							</>
						)}
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
