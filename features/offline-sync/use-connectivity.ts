"use client";

import { useEffect, useState } from "react";

export interface ConnectivityState {
	online: boolean;
	/** "slow-2g" | "2g" | "3g" | "4g" | null when the API is unavailable. */
	effectiveType: string | null;
	/** "cellular" | "wifi" | "ethernet" | ... | null. */
	connectionType: string | null;
	isSlow: boolean;
}

type NetworkInformation = {
	effectiveType?: string;
	type?: string;
	addEventListener?: (type: "change", cb: () => void) => void;
	removeEventListener?: (type: "change", cb: () => void) => void;
};

function readConnection(): Omit<ConnectivityState, "online"> {
	const conn =
		typeof navigator !== "undefined"
			? ((navigator as Navigator & { connection?: NetworkInformation })
					.connection ?? null)
			: null;
	const effectiveType = conn?.effectiveType ?? null;
	return {
		effectiveType,
		connectionType: conn?.type ?? null,
		isSlow: effectiveType === "slow-2g" || effectiveType === "2g",
	};
}

/** Live connectivity state: online/offline transitions plus connection
 * quality from the Network Information API where supported. */
export function useConnectivity(): ConnectivityState {
	const [state, setState] = useState<ConnectivityState>(() => ({
		online: typeof navigator === "undefined" ? true : navigator.onLine,
		...readConnection(),
	}));

	useEffect(() => {
		const update = () =>
			setState({ online: navigator.onLine, ...readConnection() });

		window.addEventListener("online", update);
		window.addEventListener("offline", update);
		const conn = (navigator as Navigator & { connection?: NetworkInformation })
			.connection;
		conn?.addEventListener?.("change", update);
		return () => {
			window.removeEventListener("online", update);
			window.removeEventListener("offline", update);
			conn?.removeEventListener?.("change", update);
		};
	}, []);

	return state;
}
