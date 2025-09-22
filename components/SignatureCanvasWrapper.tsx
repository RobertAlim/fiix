// components/SignatureCanvasWrapper.tsx
import React, { forwardRef } from "react";
import SignatureCanvas, {
	ReactSignatureCanvasProps,
} from "react-signature-canvas";

// Define props for the wrapper to satisfy TypeScript and linting rules
type SignatureWrapperProps = ReactSignatureCanvasProps;

const SignatureCanvasWrapper = forwardRef<
	SignatureCanvas,
	SignatureWrapperProps
>((props, ref) => {
	return <SignatureCanvas ref={ref} {...props} />;
});

// A displayName is required for components wrapped in forwardRef for debugging
SignatureCanvasWrapper.displayName = "SignatureCanvasWrapper";

export default SignatureCanvasWrapper;
