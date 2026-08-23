# FIIX — Printer Status + Scroll Area + Pending Maintenance Notes update

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

### 4. Pending Maintenance — Notes editing (Super Admin only)
- `app/api/pending-maintenance/[id]/notes/route.ts` (new) — `PATCH`
  endpoint that updates `maintain.notes` for one report. Gated with
  `requireRole(["Super Admin"])` — **not** `["Admin"]` — so this is
  strictly narrower than every other action on this panel (Assign,
  Resolve). Role implication in `lib/permissions.ts` only runs Super Admin
  → Admin, never the reverse, so a plain Admin (or Scheduler, or an
  unauthenticated request) gets a 403 even though they can see and use the
  rest of the page. This check is the actual security boundary — treat it
  as the one to trust, not the UI.
- `components/pages/PendingMaintenancePanel.tsx` — added a
  `PendingItemNotes` component. For everyone else, the Notes cell renders
  exactly as before (plain read-only text, nothing shown when there's no
  note). For Super Admin, it becomes a button that opens a Radix
  `Popover` with an editable `Textarea`, plus Cancel/Save. Save PATCHes
  the new route, shows a success/error toast, and invalidates the
  `pending-maintenance` query so the card re-renders with the persisted
  value (not the optimistic draft) once the save completes. The role gate
  (`canEditNotes`) is `!readOnly && users?.role === "Super Admin"` — the
  same `readOnly` prop that already hides the Resolve button when this
  panel is embedded read-only on the Schedule page also hides Notes
  editing there.

## Notes
- No database migration is required — `printers.status` was already a
  plain `varchar`, so "Inactive" is just a new value, not a schema
  change. Likewise `maintain.notes` was already a nullable `text` column,
  so the new Notes-editing feature needs no migration either.
- The Transfer Printer dialog's Mark Missing/Found actions are untouched
  and continue to work exactly as before; the new Status selector and
  that dialog both write to the same `printers.status` column.
- This codebase's roles are `Super Admin`, `Admin`, `Technician`, and
  `Scheduler` — there's no role literally named "Super User". Per your
  choice, Notes editing is restricted to `Super Admin` only (regular
  Admins, who use this page day-to-day for Assign/Resolve, stay
  read-only for Notes).
