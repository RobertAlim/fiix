# FIIX — Printer Status + Scroll Area + Pending Maintenance Notes + Itinerary Selection + Multi-Technician Assignment update

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

### 5. Schedule page — selected itinerary card highlight
- `components/ScheduleCard.tsx` — added an `isSelected` prop. When true,
  the card gets a heavier, persistent treatment (primary-colored border,
  tinted background, a 2px ring with offset, and a raised shadow) plus a
  small "Editing" pill badge in the top-right corner — deliberately
  distinct from the existing `isDropTarget` ring (a plain ring shown only
  for the instant a dragged card hovers over another one during
  reordering), so the two states can never be confused even in the rare
  case both are true at once.
- `components/pages/Schedule.tsx` — passes
  `isSelected={scheduleId !== 0 && Number(schedule.id) === scheduleId}`
  to each `ScheduleCard`. `scheduleId` is the existing state variable that
  already tracks which itinerary is loaded into the edit form on the left
  (set by `handleCardClick` and every other path that opens a schedule for
  edit/reschedule, reset to 0 on save/cancel) — reusing it means the
  highlight can't drift out of sync with what's actually being edited, and
  it stays lit for the whole time the Scheduler is viewing/editing that
  itinerary, not just on the initial click.

### 6. Schedule → Itinerary Assignment — multiple technicians per client, no duplicate printers
- `app/api/schedule/exists/route.ts` — the "does a schedule already exist"
  lookup used to match on `clientId + locationId + scheduledAt` only, so
  picking a second technician for a client/location/date that ANOTHER
  technician already had a schedule for silently switched the form into
  editing that other technician's schedule instead of letting you start a
  new one. It now requires `technicianId` as well (a required query param —
  requests without it get `{exists:false}`), so each technician gets their
  own itinerary for the same client/location/date, exactly as before this
  bug existed. `app/api/schedule/route.ts` (unchanged) already scoped both
  its own duplicate-schedule check and its printer-conflict check
  correctly — this route was the only piece actually causing the
  restriction.
- `components/pages/Schedule.tsx` — the `existingScheduleCheck` query now
  sends `technicianId` to the updated route above, includes it in the
  query key (so switching technicians re-checks instead of reusing a stale
  answer), and only runs once a technician is actually selected.
- `app/api/printers/route.ts` — the printer-selection list now also
  reports, per printer, whether it's already on ANOTHER technician's
  schedule for the same date (any client) — a new `otherAssignment` CTE
  joins `scheduleDetails` → `schedules` → `users`, matched on the target
  schedule's date and excluding the schedule currently being edited. Two
  new fields, `assignedTechnicianId` / `assignedTechnicianName`, are
  `null` when the printer is free (or already on the itinerary you're
  editing) and populated when it's taken. This surfaces the SAME rule
  `app/api/schedule/route.ts` already enforced at save time — a printer
  can only be in one place per day — before the Scheduler ever gets to
  Save, instead of only failing after the fact.
  (Implementation note: an initial draft of this used a `.$dynamic().if(...)`
  chain to make the extra join conditional — that's not a real Drizzle
  method and failed to compile; fixed by reassigning the query builder
  behind a plain `if`, which is the supported pattern.)
- `components/columns/printers/columns.tsx` — added
  `assignedTechnicianId`/`assignedTechnicianName` to the shared `Printer`
  type so the new fields type-check all the way through to the card.
- `components/PrinterStatusCard.tsx` — when a printer has
  `assignedTechnicianName` set, the card shows an "Assigned to
  &lt;Technician&gt;" badge, is visually dimmed, and clicking it shows a
  toast and does **not** toggle it onto the itinerary — mirroring the
  existing "already maintained" guard right next to it. This is a
  UI-level convenience only; the backend check in `app/api/schedule/route.ts`
  (unchanged, already correct) remains the actual enforcement, so a
  request that bypasses the UI still gets rejected.
- Itinerary ordering, scheduling, and the rest of the assign/save flow are
  untouched — two technicians sharing a client still each get their own
  separate schedule row and `scheduleDetails` list; only the "does one
  already exist" lookup and the printer-availability signal changed.

### 7. Fix — 500 error clicking a printer itinerary card on the Schedule page
- `app/api/printers/route.ts` — clicking any printer itinerary (e.g.
  `/api/printers?clientId=19&locationId=19&scheduleId=238`) was returning
  a 500 "Failed to retrieve printer data due to a server error." Root
  cause: the `otherAssignment` CTE added in the previous update (item 6,
  the "assigned to another technician" badge) selects `FROM the real
  scheduleDetails table`, but the query's OTHER CTE — the one that
  dedupes this schedule's own printers — was itself named
  `"scheduleDetails"` (identical to the real table). In Postgres, a CTE
  is visible to every CTE defined after it in the same `WITH` list, so
  that name collision meant the new `otherAssignment` CTE's `FROM
  scheduleDetails` silently resolved to the OTHER CTE instead of the real
  table. That CTE doesn't have a `scheduleId` column (it's named
  `schedId`), so the join inside `otherAssignment` failed with
  "column scheduleDetails.scheduleId does not exist" — a Postgres error
  on every request, since `scheduleId` is always present when clicking an
  itinerary. Fixed by renaming that CTE from `"scheduleDetails"` to
  `"scheduleDetailsCte"`, which removes the collision; confirmed via the
  actual generated SQL (`.toSQL()`) that `otherAssignment` now correctly
  joins the real `scheduleDetails` table. No other files needed changes —
  the multi-technician assignment logic from item 6 (allowing the same
  client on multiple technicians' schedules while blocking the same
  printer being double-assigned) is otherwise unchanged and unaffected.

### 8. Fix — 500 error clicking a printer itinerary card, take 2
- `app/api/printers/route.ts` — item 7's fix (the CTE name collision) was
  real but not the only bug on this code path. After that fix, the same
  request still 500'd, now with a different, more specific error visible
  in the server terminal:
  > You tried to reference "technicianName" field from a subquery, which
  > is a raw SQL field, but it doesn't have an alias declared. Please add
  > an alias to the field using ".as('alias')" method.

  The `otherAssignment` CTE builds `technicianName` from a raw `sql`
  template (`${users.firstName} || ' ' || ${users.lastName}`) rather than
  a plain column — Drizzle requires any such raw-SQL field to be
  explicitly aliased with `.as(...)` before it can be referenced from an
  outer query (`otherAssignment.technicianName`, used further down when
  building `assignedTechnicianName`). It wasn't aliased, so Drizzle threw
  the moment that reference was evaluated — at request time, not at
  `tsc`/build time, which is why this only surfaced once the earlier CTE
  bug stopped masking it. Fixed by adding `.as("technician_name")`,
  matching the pattern already used a few lines above for
  `maintainedDate` (`TO_CHAR(...).as("maintained_date")`) in the same
  file — confirmed via the actual generated SQL that the outer query now
  cleanly selects `"technician_name"` with no error.
- Between items 7 and 8, `/api/printers?...&scheduleId=...` should now
  return successfully. If clicking an itinerary card still errors, please
  paste the server terminal error text again (not just the browser
  toast) — Next.js API routes only send a generic message to the browser
  on purpose, and the real cause always shows up in the terminal like it
  did for these last two.

### 9. Fix — genuine 409 on saving Technician B's own printer itinerary
- `app/api/schedule/route.ts` — updating (or creating) a schedule for
  Technician B, using printers meant for Technician B's own separate
  itinerary for a shared client, was being rejected with:
  > Printer(s) ... already scheduled for 2026-08-25 on a different
  > schedule.

  Root cause: both the create-path and update-path "is this printer
  double-booked" checks matched on *scheduledAt* across **all**
  schedules for that date, excluding only the exact schedule row being
  edited (`scheduleId != newScheduleId`). Under the multi-technician
  model, that's too narrow — a technician can legitimately hold more
  than one schedule for the same date (a different client/location, or
  simply the schedule currently being edited), and a printer sitting on
  one of THEIR OWN other schedules isn't a real double-booking, but the
  old check flagged it as one anyway. The actual business rule is about
  **technicians**, not schedule rows: a printer is only genuinely
  conflicting when it's already on a DIFFERENT technician's schedule for
  that date. Both checks now filter on `schedules.technicianId !=
  <this technician>` instead of `scheduleId != <this schedule>` — this
  naturally excludes every schedule belonging to the technician being
  saved (including the current one), while still catching a real
  cross-technician double-booking exactly as before.
- `app/api/printers/route.ts` — the "Assigned to &lt;technician&gt;"
  badge lookup (`otherAssignment` CTE, added in item 6) had the identical
  narrowing bug — it excluded only the one schedule being viewed
  (`schedules.id != scheduleId`), so it could show a printer as "already
  assigned" to a technician when it was actually just sitting on THAT
  SAME technician's own other schedule for the day. Fixed the same way:
  the CTE now looks up the current schedule's `technicianId` (alongside
  its date, already fetched) and excludes every schedule belonging to
  that technician, not just the current schedule row. This also keeps
  the badge and the save-time validation in agreement — a printer the
  badge shows as free will no longer turn around and get rejected on
  save, and vice versa.
- The "Already Assigned to &lt;technician&gt;" badge/label itself
  (visual styling, click-guard, toast) from item 6 is untouched — only
  the underlying "is this actually a conflict" query changed, in both
  places, to the same, more precise technician-scoped rule.

### 10. Fix — stale printer-toggle edits leaking across technicians
- `components/pages/Schedule.tsx` — after successfully saving several
  technicians' itineraries for the same client, editing ONE of them again
  to add a genuinely new ("overlooked") printer could still 409 with
  "Printer(s) ... already scheduled ... on a different schedule" — even
  though item 9's technician-scoped conflict check was correct and
  working. This was a different, second bug with the same symptom.

  Root cause: `edits` — the React state that records which printers the
  Scheduler has toggled on/off on the "Printer Details List" cards — was
  **never cleared**. It's keyed only by printer id, with no idea which
  technician or schedule it was recorded against. So the actual sequence
  was: toggle some printers on for Technician A, Save (succeeds) →
  switch to Technician B for the same client → those same printer ids
  are STILL sitting in `edits` from Technician A's session → `changedPrinters`
  (and from it, `diffPrinters`'s "added" list) merges them back in against
  Technician B's printer list, where they don't appear yet — so they get
  silently included in Technician B's save payload as newly "added",
  even though the Scheduler only meant to touch them for Technician A.
  The backend then correctly rejects them, because they genuinely ARE
  already on Technician A's schedule for that date — the 409 was
  accurate, just about a printer the Scheduler never intentionally
  selected for B.

  Fixed by clearing `edits` (`setEdits({})`) at every point a different
  schedule's printers get loaded or the printer-editing session otherwise
  ends: when the `existingSchedule` effect loads a newly-selected
  technician's own schedule, when there's no existing schedule for the
  current selection (fresh "create" mode), in `handleShowDetails` and
  `handleCardClick` (opening a different itinerary card), after a
  mutation succeeds, and — as a backstop for the case where two
  technicians in a row both have no existing schedule yet (so the two
  effects above don't detect a change and skip their reset) — whenever
  `selectedTechnicianId` itself changes.
- No backend changes were needed for this one — items 9's conflict-check
  logic was already correct; this was purely a frontend state-leak that
  fed it the wrong printer ids to check.

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
