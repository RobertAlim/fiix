export function formatDateManila(dateIso: string | null | undefined) {
	if (!dateIso) return "—";
	try {
		// Use toLocaleString for Asia/Manila
		const d = new Date(dateIso);
		return d.toLocaleString("en-PH", {
			timeZone: "Asia/Manila",
			year: "numeric",
			month: "short",
			day: "2-digit",
		});
	} catch {
		return dateIso ?? "—";
	}
}
