// SignatureCanvasWrapper.tsx
import React, { forwardRef } from "react";
import SignatureCanvas, { SignatureCanvasProps } from "react-signature-canvas";

// The forwardRef component that wraps react-signature-canvas.
// This handles passing the ref correctly to the underlying component.
const SignatureCanvasWrapper = forwardRef<
	SignatureCanvas,
	SignatureCanvasProps
>((props, ref) => {
	return <SignatureCanvas ref={ref} {...props} />;
});

// A displayName is added for better debugging in tools like React DevTools.
SignatureCanvasWrapper.displayName = "SignatureCanvasWrapper";

export default SignatureCanvasWrapper;
