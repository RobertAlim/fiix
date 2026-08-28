# Update — 2026-08-28

Maintenance Print Count capture + new Related Issues search module.

## 1. Maintenance — Save Print Count

`maintain.printCount` already existed in the schema, and `app/api/maintain/route.ts`
already required it on save (with a monotonic "can't be lower than last recorded"
check) and returned the printer's last known count as `lastPrintCount`. The gap was
purely on the frontend: the Maintenance form had no Print Count input at all, so the
field was never populated and every save relied on the server rejecting a missing
value.

- `components/pages/Maintenance.tsx`
  - Added a **Print Count** number input, positioned in the row right below
    Model / Serial Number / Date, wired via `register("printCount", { valueAsNumber: true })`.
  - Reads the printer's `lastPrintCount` (already returned by `GET /api/maintain`,
    previously unused) via an extended `applyMaintenanceData` signature, and shows it
    under the input as "Last recorded: N" for reference.
  - Added a client-side blocking check in `onSubmit` — "Print Count is required" toast
    + early return — before the offline-first local save proceeds, mirroring the
    existing Nozzle Check required-field pattern. This matters because the offline
    save writes to IndexedDB immediately and syncs later, so the check has to happen
    before that local save, not only on the server.
  - No schema, validation, or API changes were needed — `validation/maintainSchema.ts`
    and `app/api/maintain/route.ts` already supported this end-to-end.

## 2–6. New "Related Issues" navigation module

A new nav link, positioned immediately after **Pending Maintenance**, that lets a
Scheduler/Admin free-text search every past maintenance report's Notes for a symptom,
part, or phrase (e.g. "gear", "jam", "roller") — surfacing every printer that's ever
had it, not just what's currently outstanding in Pending Maintenance.

- **`lib/permissions.ts`** — added `"relatedIssues"` to the `ModuleKey` union and to
  both the Admin and Scheduler module lists, immediately after `"pendingMaintenance"`
  in each, so access tracks the same audience as Pending Maintenance.

- **`app/(root)/dashboard/page.tsx`** — added the **Related Issues** nav entry
  (right after Pending Maintenance, `Search` icon), its `PAGE_TITLES` entry, a
  `dynamic()` import for the new page, and the matching `case` in `renderContent()`'s
  switch.

- **`app/api/related-issues/route.ts`** (new) — `GET /api/related-issues?keyword=...`.
  Case-insensitive `ilike` search over `maintain.notes`, joined through
  `maintain.deploymentId → deployments → printers/models/clients` (not through the
  printer's *current* deployment) so results show the client/model as of that
  specific report — a later printer transfer opens a new deployment row rather than
  editing the old one, so this keeps old reports historically accurate. Same
  `requireRole(["Admin", "Scheduler"])` gate as Pending Maintenance. Capped at 100
  results (newest first), with a `truncated` flag surfaced to the UI.

- **`components/pages/RelatedIssues.tsx`** (new) — the page itself: a debounced
  (300ms) search box, and matching reports rendered as cards — Printer Model /
  Serial Number / Client up top, matching Notes (with the keyword highlighted) below.
  Clicking a card opens the *same* `PrinterHistoryDialog` used from the Printers
  grid, passing the printer id and the searched keyword.

- **`lib/highlight-text.tsx`** (new) — shared `highlightMatches()` (wraps every
  case-insensitive occurrence of a keyword in `<mark>`, safely escaping regex
  metacharacters in user input) and `containsKeyword()` helpers, used by both the
  Related Issues cards and the history modal below.

- **`components/PrinterHistoryDialog.tsx`** — extended with an optional
  `highlightKeyword` prop (omitted/empty = existing behavior, unchanged design):
  when set, every occurrence of the keyword in each history row's Notes is
  highlighted (desktop table and mobile card views both), the first matching row
  gets a visible ring highlight, and the dialog auto-scrolls that row into view as
  soon as the data loads — so the report the user searched for is immediately
  visible without manually scanning the history.

## Verification

- `npx tsc --noEmit -p tsconfig.json` — clean, no errors.
- `npx next lint` — no new warnings; only pre-existing warnings remain (unrelated
  `<img>` usage, a few pre-existing `react-hooks/exhaustive-deps` warnings including
  one already present on the `onHandleScan` effect in `Maintenance.tsx`, and missing
  `alt` props in `MaintainReport.tsx`).

## Files in this delta

```
lib/permissions.ts                       (modified)
lib/highlight-text.tsx                   (new)
app/api/related-issues/route.ts          (new)
app/(root)/dashboard/page.tsx            (modified)
components/pages/Maintenance.tsx         (modified)
components/pages/RelatedIssues.tsx       (new)
components/PrinterHistoryDialog.tsx      (modified)
```

Copy these files into your project at the exact same relative paths — no other files
are touched.
