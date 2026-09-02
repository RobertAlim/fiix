"use client";

// components/tracker/image-viewer-modal.tsx
//
// A zoomable/pannable full view of a photo — currently used by the
// Support Service card's Technician Photo (task-tracker.tsx), but kept
// generic (just a title + image URL) in case another photo elsewhere in
// Task Tracker ever needs the same treatment.
//
// Built on react-zoom-pan-pinch rather than hand-rolled wheel/touch
// handlers — pinch-to-zoom in particular has enough subtlety (tracking
// two touch points, computing the midpoint as the zoom anchor, ignoring
// a third finger, etc.) that reimplementing it is a worse bet than using
// a library that already gets this right across browsers/devices. Wheel
// zoom and pinch-zoom are both enabled by default; this component only
// configures bounds and the on-open sizing.
import * as React from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ZoomIn, ZoomOut, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ImageViewerModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	imageUrl: string;
	title?: string;
}

// The inline Schedule Details card now caps the photo at max-h-[32rem]
// (512px — see task-tracker.tsx's SupportServiceDetailsCard). This
// modal's own initial display is set well beyond 2× that (not just
// exactly 2×) per requirement 3 ("use as much available screen space as
// practical") — 80vh comfortably clears "at least 2×" on any realistic
// screen while actually using the enlarged modal's available height,
// rather than sitting at a small fixed size inside a now-much-bigger
// dialog. Zoom controls (wheel/pinch) scale up from THIS size.
const INITIAL_DISPLAY_MAX_HEIGHT = "80vh";

export function ImageViewerModal({ open, onOpenChange, imageUrl, title }: ImageViewerModalProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			{/* Sized to fill almost the entire viewport (requirement 3: "use
			    as much available screen space as practical while
			    maintaining appropriate margins") — was capped at max-w-5xl
			    (64rem/1024px), which left a lot of unused space on any
			    reasonably large monitor despite the 95vw. No max-w cap now;
			    the 3vw/3vh gaps below ARE the "appropriate margins." */}
			<DialogContent
				className="flex h-[97vh] w-[97vw] max-w-none flex-col overflow-hidden p-0 sm:max-w-none sm:p-2"
				// Stops a click anywhere in the viewer (background, controls,
				// the image itself while NOT actively dragging) from bubbling
				// out to whatever's behind the Dialog's portal root — belt and
				// suspenders alongside the stopPropagation() on the trigger
				// in task-tracker.tsx, since Radix already portals this
				// content outside the card's own DOM subtree.
				onClick={(e) => e.stopPropagation()}
			>
				<DialogTitle className="sr-only">{title ?? "Photo viewer"}</DialogTitle>

				<TransformWrapper
					initialScale={1}
					minScale={0.5}
					maxScale={6}
					// Wheel step reduced again — 0.15 (the previous tuning)
					// still felt like it jumped between zoom levels rather
					// than gliding. 0.04 is roughly 4× finer per wheel notch:
					// noticeably slower and smoother scrolling up/down, with
					// zoomAnimation below giving each step its own brief
					// eased transition instead of snapping instantly, which
					// is what actually reads as "smooth" rather than just
					// "small steps that still snap."
					wheel={{ step: 0.04 }}
					pinch={{ step: 5 }}
					doubleClick={{ mode: "toggle" }}
					centerOnInit
					smooth
					zoomAnimation={{ animationTime: 200, animationType: "easeOutCubic" }}
				>
					{({ zoomIn, zoomOut, resetTransform }) => (
						<>
							{/* Floating zoom controls — wheel/pinch are the PRIMARY
							    interaction the request asks for, but a visible
							    button pair matters for anyone on a device/trackpad
							    where neither gesture is convenient (or discoverable)
							    on first use.
							    
							    The Close button is folded into THIS toolbar rather
							    than left to rely on DialogContent's own built-in
							    close button (components/ui/dialog.tsx renders one
							    at the same absolute top-4 right-4 corner) — the two
							    were sitting directly on top of each other, which is
							    exactly the kind of thing that makes a close button
							    NOT "clearly visible" per the request. One explicit,
							    high-contrast button here, in the same toolbar as
							    the zoom controls, avoids the collision entirely
							    rather than trying to carefully out-z-index the
							    default one. */}
							<div className="absolute right-4 top-4 z-20 flex items-center gap-1 rounded-md bg-background/95 p-1 shadow-md backdrop-blur">
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="h-8 w-8"
									onClick={() => zoomIn()}
									aria-label="Zoom in"
								>
									<ZoomIn className="h-4 w-4" />
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="h-8 w-8"
									onClick={() => zoomOut()}
									aria-label="Zoom out"
								>
									<ZoomOut className="h-4 w-4" />
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="h-8 w-8"
									onClick={() => resetTransform()}
									aria-label="Reset zoom"
								>
									<RotateCcw className="h-4 w-4" />
								</Button>
								<div className="mx-1 h-5 w-px bg-border" aria-hidden />
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="h-8 w-8"
									// stopPropagation here is the same defensive
									// insurance as the photo's own onClick in
									// task-tracker.tsx — there's no ambient parent
									// onClick left for this to fight after that
									// restructure, but a click that CLOSES this
									// modal is exactly the interaction the request
									// calls out by name ("closing the modal does
									// not trigger the underlying ... popup"), so
									// this stays explicit rather than assumed safe.
									onClick={(e) => {
										e.stopPropagation();
										onOpenChange(false);
									}}
									aria-label="Close"
								>
									<X className="h-4 w-4" />
								</Button>
							</div>

							<TransformComponent
								wrapperClass="!w-full !h-full flex items-center justify-center bg-muted/30"
								contentClass="!w-full !h-full flex items-center justify-center"
							>
								{/* Plain <img>, not next/image — same reasoning as the
								    inline card version in task-tracker.tsx: the source
								    is a short-lived presigned R2 URL, and
								    TransformWrapper needs to measure/transform the
								    actual rendered <img> element directly, which
								    next/image's wrapper markup would complicate for no
								    benefit here. */}
								{/* eslint-disable-next-line @next/next/no-img-element */}
								<img
									src={imageUrl}
									alt={title ?? "Technician submission photo"}
									style={{ maxHeight: INITIAL_DISPLAY_MAX_HEIGHT }}
									className="max-w-full select-none object-contain"
									draggable={false}
								/>
							</TransformComponent>
						</>
					)}
				</TransformWrapper>
			</DialogContent>
		</Dialog>
	);
}
