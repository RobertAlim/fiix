// lib/printer-history-status.ts
//
// Which status names get the red/green highlight treatment in the Printer
// History modal (components/PrinterHistoryDialog.tsx). Deliberately its
// own small list rather than reusing lib/maintenance-status.ts's
// NEEDS_ATTENTION_STATUSES — that constant drives a different feature
// (whether a report shows up in Pending Maintenance) and, while it
// overlaps with this one, isn't guaranteed to stay identical to it.
//
// A couple of entries carry a known alias: this app's established status
// vocabulary elsewhere spells one of these without parentheses ("For
// Replacement Printer Part" — see NEEDS_ATTENTION_STATUSES), so both forms
// are matched here in case the live `status` table uses that spelling
// instead of the one given in the request.
const RED_STATUSES = new Set(
	[
		"Pulled Out",
		"For Replacement of Printer",
		"For Replacement (Printer Part)",
		"For Replacement Printer Part", // established alias, no parens
		"Change Unit",
	].map((s) => s.toLowerCase())
);

const GREEN_STATUSES = new Set(["resolved"]);

export type StatusTheme = "red" | "green" | "normal";

export function getStatusTheme(statusName: string | null | undefined): StatusTheme {
	const normalized = statusName?.trim().toLowerCase();
	if (!normalized) return "normal";
	if (RED_STATUSES.has(normalized)) return "red";
	if (GREEN_STATUSES.has(normalized)) return "green";
	return "normal";
}

/** Tailwind classes for a status theme, used for both the table-row tint
 * and the status badge itself. */
export const STATUS_THEME_CLASSES: Record<StatusTheme, { row: string; badge: string }> = {
	red: {
		row: "bg-destructive/5 hover:bg-destructive/10",
		badge: "bg-destructive/15 text-destructive border-destructive/30",
	},
	green: {
		row: "bg-success/5 hover:bg-success/10",
		badge: "bg-success/15 text-success border-success/30",
	},
	normal: {
		row: "",
		badge: "bg-muted text-muted-foreground border-transparent",
	},
};
