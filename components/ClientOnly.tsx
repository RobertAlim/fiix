// components/ClientOnly.tsx
import { useEffect, useState, ReactNode } from "react";

// Define the type for the component's props, which is a ReactNode
interface ClientOnlyProps {
	children: ReactNode;
}

const ClientOnly = ({ children }: ClientOnlyProps) => {
	const [hasMounted, setHasMounted] = useState<boolean>(false);

	// This hook ensures the component state is updated only on the client
	useEffect(() => {
		setHasMounted(true);
	}, []);

	// During SSR or before mounting, return null
	if (!hasMounted) {
		return null;
	}

	// Once mounted, render the children
	return <>{children}</>;
};

export default ClientOnly;
