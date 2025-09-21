// components/SignaturePad.tsx
import React, { useRef, useState, forwardRef } from "react";
import { Button } from "@/components/ui/button";
import dynamic from "next/dynamic";
import SignatureCanvas, { SignatureCanvasProps } from "react-signature-canvas";

const SignatureCanvasWrapper = forwardRef<
	SignatureCanvas,
	SignatureCanvasProps
>((props, ref) => {
	return <SignatureCanvas ref={ref} {...props} />;
});

// Dynamically import SignatureCanvas with ssr: false
const DynamicSignatureCanvas = dynamic(
	() => Promise.resolve(SignatureCanvasWrapper),
	{ ssr: false }
);

export default function SignaturePad({
	onSave,
}: {
	onSave: (signature: string) => void;
}) {
	const sigCanvasRef = useRef<SignatureCanvas | null>(null);
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
			<DynamicSignatureCanvas
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
