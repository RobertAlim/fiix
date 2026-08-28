// lib/highlight-text.tsx
//
// Shared keyword-highlighting helper. Used by the Related Issues search
// (components/pages/RelatedIssues.tsx) to bold-and-color the matched
// keyword in each result card's Notes preview, and by
// components/PrinterHistoryDialog.tsx to highlight that same keyword
// wherever it appears in a printer's full maintenance history once the
// dialog is opened from a Related Issues card.
import React from "react";

/** Escapes a string for safe use inside a `new RegExp(...)` — otherwise a
 * keyword containing regex metacharacters (e.g. "3.5\"" or "(reset)")
 * would throw or match something entirely different than what the user
 * typed. */
function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Splits `text` on every case-insensitive occurrence of `keyword` and
 * wraps each match in a `<mark>` so it stands out — a plain, non-null
 * `keyword` with at least one non-whitespace character. Returns `text`
 * unchanged (as a single string, not an array) when there's nothing to
 * highlight, so callers that don't have a keyword can render the result
 * exactly as before.
 */
export function highlightMatches(
	text: string,
	keyword: string | null | undefined
): React.ReactNode {
	const trimmed = keyword?.trim();
	if (!trimmed) return text;

	const parts = text.split(new RegExp(`(${escapeRegExp(trimmed)})`, "gi"));
	if (parts.length === 1) return text;

	return parts.map((part, i) =>
		part.toLowerCase() === trimmed.toLowerCase() ? (
			<mark
				key={i}
				className="rounded bg-warning/40 px-0.5 text-inherit dark:bg-warning/50"
			>
				{part}
			</mark>
		) : (
			<React.Fragment key={i}>{part}</React.Fragment>
		)
	);
}

/** True when `text` contains `keyword`, case-insensitively. Used to find
 * the first matching row to scroll into view when a history modal opens
 * pre-filtered from a Related Issues search. */
export function containsKeyword(
	text: string | null | undefined,
	keyword: string | null | undefined
): boolean {
	const trimmed = keyword?.trim().toLowerCase();
	if (!trimmed || !text) return false;
	return text.toLowerCase().includes(trimmed);
}
