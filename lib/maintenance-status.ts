// lib/maintenance-status.ts
// Single source of truth for "this printer still needs a technician".
//
// This list was previously duplicated in three places (the pending-maintenance
// route, the open-issues route's commented-out filter, and a client-side
// TARGET_STATUSES set in Schedule.tsx), which is how they drifted apart.
// Anything that decides whether work is outstanding should import from here.
export const NEEDS_ATTENTION_STATUSES = [
	"Replacement (Parts)",
	"Replacement (Unit)",
	"Pulled Out",
	"For Replacement Printer Part",
	"For Replacement (Printer Part)",
	"For Replacement of Printer",
] as const;

export type NeedsAttentionStatus = (typeof NEEDS_ATTENTION_STATUSES)[number];

/** Mutable copy for drizzle's inArray(), which doesn't accept readonly tuples. */
export const NEEDS_ATTENTION_STATUS_LIST: string[] = [...NEEDS_ATTENTION_STATUSES];
