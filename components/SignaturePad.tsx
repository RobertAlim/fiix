// components/SignaturePad.tsx
import React, { useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Button } from "@/components/ui/button";

export default function SignaturePad({
	onSave,
}: {
	onSave: (signature: string) => void;
}) {
	const sigCanvasRef = useRef<SignatureCanvas>(null);
	const [isEmpty, setIsEmpty] = useState(true);

	const handleClear = () => {
		sigCanvasRef.current?.clear();
		setIsEmpty(true);
	};

	const handleSave = () => {
		if (sigCanvasRef.current?.isEmpty()) {
			alert("Please provide a signature before saving.");
			return;
		}
		const dataUrl = sigCanvasRef.current
			?.getTrimmedCanvas()
			.toDataURL("image/png");
		if (dataUrl) {
			onSave(dataUrl);
		}
	};

	return (
		<div className="p-4 border rounded-xl w-full max-w-md bg-white">
			<p className="mb-2 font-medium">Sign below:</p>
			<SignatureCanvas
				penColor="black"
				canvasProps={{
					width: 400,
					height: 150,
					className: "border rounded-md border-gray-300",
				}}
				minWidth={1} // Minimum stroke width
				maxWidth={1.5} // Maximum stroke width
				ref={sigCanvasRef}
				onEnd={() => setIsEmpty(false)}
			/>
			<div className="mt-4 flex justify-between">
				<Button variant={"destructive"} onClick={handleClear}>
					Clear
				</Button>
				<Button variant={"default"} onClick={handleSave} disabled={isEmpty}>
					Save Signature
				</Button>
			</div>
		</div>
	);
}
