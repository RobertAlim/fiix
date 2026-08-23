# FIIX — Printer Status + Scroll Area update

Delta package — copy these files into your project at the exact paths
shown below (they mirror the project's folder structure 1:1). No other
files are touched.

## After copying

```
npm install
```

This pulls in the two new dependencies added to `package.json` /
`package-lock.json`:

- `@radix-ui/react-radio-group`
- `@radix-ui/react-scroll-area`

## What changed

### 1. Printer → Edit Printer → Status
- `components/ui/radio-card.tsx` (new) — a colored Radix RadioGroup "card"
  selector (green/blue/red).
- `components/MasterDataManager.tsx` — added a `"radio-card"` field type
  and a `row` grouping option (fields sharing a `row` key render side by
  side). This is the shared modal used by every "master data" page (not
  just Printers), so the new field type is available everywhere without
  further changes.
- `components/pages/Printers.tsx` — added the Status field (Active /
  Inactive / Missing), on its own full-width row, with Serial Number
  stacked directly below it on its own row (not side-by-side).
- `app/api/admin/master/printers/route.ts`,
  `app/api/admin/master/printers/[id]/route.ts` — accept and persist the
  new `status` value (`"Active" | "Inactive" | "Missing"`).
- `db/schema.ts` — updated the doc comment on `printers.status` to
  document the new "Inactive" value (no migration needed — the column is
  already a free-text `varchar`).
- `components/pages/Printers.tsx` — the Status column badge now also
  renders "Inactive" (previously only "Active"/"Missing").
- `components/PrinterTransferDialog.tsx` — removed the "Mark as
  Missing"/"Mark as Found" tab (it duplicated the new Status selector on
  the Edit Printer form). This dialog now only does Transfer; a small
  banner still warns when transferring a unit that's currently flagged
  Missing, pointing at Status on the Edit form to clear it. The
  markMissing/markFound actions still exist on the transfer API route for
  backward compatibility, but nothing in the UI calls them anymore.

### 2. Radix UI Scroll Area
- `components/ui/scroll-area.tsx` (new) — the shared `ScrollArea`/
  `ScrollBar` primitives.
- `components/ui/table.tsx` — the base `<Table>` wrapper (used by nearly
  every grid in the app) now scrolls horizontally through a slim
  `ScrollArea` instead of the native browser scrollbar.
- `components/ui/data-table.tsx`, `components/MasterDataManager.tsx` —
  their table containers add a vertical `ScrollArea` (capped height) on
  top of the table's own horizontal one.
- `components/UnmaintainedPrintersPanel.tsx`,
  `components/pages/PendingMaintenancePanel.tsx` — their printer/pending
  card grids no longer have their own capped scroll box (an earlier pass
  nested a fixed-height ScrollArea inside these panels *and* inside the
  page-level ScrollArea below, which clipped cards instead of scrolling
  them). They now grow naturally and scroll as part of the one shared
  container from item 3.
- `components/ImportCsvCard.tsx`, `components/SyncStatusIndicator.tsx`,
  `components/OpenIssuesBell.tsx`, `components/PrinterHistoryDialog.tsx`,
  `components/tracker/task-tracker.tsx`,
  `app/(root)/dashboard/page.tsx` — assorted overflow lists/panels/sidebar
  nav swapped from native `overflow-y-auto` to `ScrollArea`.

### 3. Grouped Card Scrolling (Schedule page)
- `components/pages/Schedule.tsx` — Unmaintained Printers, Pending
  Maintenance, and the Schedule workflow below are now wrapped in one
  shared `ScrollArea` container instead of three separate large browser
  scrollbars. The "Open Issues" side sheet's list also uses `ScrollArea`.

## Notes
- No database migration is required — `printers.status` was already a
  plain `varchar`, so "Inactive" is just a new value, not a schema
  change.
- The Transfer Printer dialog's Mark Missing/Found actions are untouched
  and continue to work exactly as before; the new Status selector and
  that dialog both write to the same `printers.status` column.
