# Fiix web app updates — apply into your repo at these exact paths

Supersedes nothing earlier — this is on top of your existing repo, plus
everything from the prior thirteen delivery rounds. Organized by round
below so you can tell what's new in THIS zip vs. what you should already
have applied. Rounds 4 through 13 have no database schema changes.
**Round 14 does** — a schema change AND a data-deleting migration. Read
that section in full before applying it.

## ⚠️ Read this before touching db/schema.ts

The copy of `db/schema.ts` in this zip is a full-file snapshot and **is not
safe to copy over your real file** — a prior round of this already deleted
a `printCount` column that existed in the live repo but not in this
snapshot, breaking the build. Never replace your whole `db/schema.ts` with
the one in this zip. Instead, make the two small, targeted edits below
directly in your own current file.

### Edit 1 — add one field to the existing `printers` table (Round 3)

Find your current `printers` table definition and add the `status` line
(with its doc comment) exactly where shown — don't replace the whole table
block, just insert this one field:

```ts
export const printers = pgTable("printers", {
	id: serial("id").primaryKey(),
	serialNo: varchar("serialNo", { length: 50 }).notNull(),
	deployedClient: integer("clientId").notNull(),
	/**
	 * "Active" | "Missing". A plain string rather than a foreign key into
	 * `status` (which enumerates MAINTENANCE report statuses, e.g.
	 * "Pulled Out") — this is a different, narrower concept entirely:
	 * whether the physical unit can currently be located at all, set only
	 * from the Missing/Found actions in the Transfer Printer dialog
	 * (components/PrinterTransferDialog.tsx). "Missing" means specifically
	 * "not physically found at its recorded location, but still exists in
	 * the system" — it is never set anywhere else, and a normal transfer
	 * (the printer was found and moved) always clears it back to "Active".
	 */
	status: varchar("status", { length: 20 }).notNull().default("Active"),
	createdAt: timestamp("createdAt")
		.notNull()
		.default(sql`now()`),
});
```

If your `printers` table already has other fields beyond what's shown here
(from your own changes since the last upload), keep them — just add the
`status` line among them.

### Edit 2 — append two new tables to the end of the file (Round 2, if not already done)

If you haven't already applied the previous round's delivery, also paste
the `staffGpsLocations` and `maintenanceResolutions` table blocks (with
their doc comments) onto the end of your file. Look them up in this zip's
`db/schema.ts` — they're the last two `export const` blocks in the file. If
you already applied this in a prior round, skip it.

### Edit 3 — restructure the `scheduleDetails` table (Round 14)

Find your current `scheduleDetails` table and change it from a plain
two-argument `pgTable("scheduleDetails", {...})` to a three-argument one
with a unique index. Copy the exact shape from this zip's `db/schema.ts`
(search for `scheduleDetailsSchedulePrinterUnique`) — it's a bigger
structural change than a single line, worth copying precisely rather than
retyping.

### Verify before building

```bash
grep -n "export const staffGpsLocations\|export const maintenanceResolutions\|status: varchar(\"status\"\|scheduleDetailsSchedulePrinterUnique" db/schema.ts
```
You should get four hits total. Zero on any of them means that edit didn't
land — check you saved the right file.

---

## ⚠️ Round 14 — HAS a database schema change AND a data-deleting migration

Unlike every round before it, this one is not purely additive. Read this
whole section before applying.

### What it does
Confirmed by your query: schedule 218 had **every one of its ~10
printers** duplicated, count exactly 2 each — a whole edit submission
processed twice, not one printer toggled twice. The select-then-insert
guard from Round 13 reduces this but has a race window (check, then
insert, aren't atomic) — a fast enough double-submission can still slip
through both requests' checks before either insert lands.

The real fix is a database-level unique constraint: a printer can now
never be inserted onto the same schedule twice, full stop, enforced by
Postgres itself rather than application code.

### Migration 0061 — read before running
```sql
-- deletes duplicate scheduleDetails rows, keeping one per
-- (scheduleId, printerId): the isMaintained=true one if either duplicate
-- has it set, otherwise the lowest id
-- then adds the unique constraint
```
The delete only removes rows already confirmed to be exact junk copies
(same status, notes, everything) from the diagnostic query you ran. It's
still a deletion of production rows — review the migration file yourself
before running it if you want to double-check its logic against your
data first. Written idempotently (safe to re-run; the delete becomes a
no-op once no duplicates remain).

### Schema change
`db/schema.ts` — `scheduleDetails` gains a unique index on
`(scheduleId, printerId)`. **Add this to your existing `scheduleDetails`
table definition** (don't replace the whole file) — the table needs to
change from a plain object second argument to `pgTable("scheduleDetails", {...}, (table) => ({...}))`
with the unique index in that third argument. See this zip's `db/schema.ts`
for the exact shape to match.

### Code change
`app/api/schedule/route.ts` — both the create and edit flows' printer
inserts now use `.onConflictDoNothing({ target: [scheduleDetails.scheduleId,
scheduleDetails.printerId] })`, which is what actually closes the race —
the existing pre-checks stay too, for a friendlier early response on the
common (non-race) case, but the constraint is now the real backstop.

### After applying
```bash
npm run db:migrate
```
then verify the duplicates are gone and the constraint exists:
```sql
SELECT "scheduleId", "printerId", COUNT(*) FROM "scheduleDetails"
GROUP BY "scheduleId", "printerId" HAVING COUNT(*) > 1;
-- should return zero rows now
```

---



No database changes.

### Root cause
A different vector of the same bug class as Rounds 10 and 12: a printer
can end up with **two `scheduleDetails` rows on the same schedule**
(rather than the same report linked from two different schedules, which
is what Round 10 fixed). `app/api/printers/route.ts` — which backs the
"Printer Details List" you see when editing an existing schedule on the
Schedule page — joins `scheduleDetails` scoped to that one schedule with
no deduplication, so a printer with two rows there shows up twice, keyed
by `printer.id`. That's your "duplicate key 10."

**Confirm it:**
```sql
SELECT "scheduleId", "printerId", COUNT(*) AS row_count
FROM "scheduleDetails"
GROUP BY "scheduleId", "printerId"
HAVING COUNT(*) > 1;
```

### The fix — two layers, same pattern as before
1. **Read-side (`app/api/printers/route.ts`)**: the `scheduleDetails` join
   now goes through a `selectDistinctOn`-deduplicated CTE (picking the
   most-recently-created row per printer within that schedule), so this
   list can't duplicate a row even if the underlying data does.
2. **Write-side (`app/api/schedule/route.ts`)**: found the actual gap —
   the schedule **edit** flow's conflict check deliberately excludes the
   schedule being edited (re-saving its own existing printers is normal,
   not a conflict), but that also meant nothing stopped a printer that
   was already on the schedule from being inserted a second time if the
   client's added/removed diff was ever wrong. Now filters out any
   printer that already has a row on that schedule before inserting.
   Also added a lighter dedupe on the **create** flow's insert, for the
   simpler case of the submitted list itself naming the same printer
   twice.

If the diagnostic query above returns existing duplicate rows, those
predate this fix and won't be cleaned up automatically — same as Round
10's guidance, I didn't touch existing data without your confirmation on
which row to keep.

---



No database changes.

### What was found
`app/api/sched-details/route.ts` is the last step of filing a report — the
offline sync engine (`features/offline-sync/sync-engine.ts`) calls it right
after the report itself is saved, to flip that printer's `scheduleDetails`
row to maintained and link it to the new report. The route had two real
bugs that could each independently cause exactly this symptom (a report
visibly exists, but Schedule Details still shows Pending):

1. Its `catch` block returned `{ success: true }` **before** its own
   error-logging and 500 response — making that response unreachable
   dead code. Any exception during the update was silently swallowed and
   reported as success.
2. A stale or mismatched `schedDetailsId` (matching zero rows) wasn't
   treated as a failure either — an `UPDATE` matching nothing isn't an
   exception in Postgres, it just quietly does nothing, and the route
   still returned success.

Either way, the sync engine's own retry logic (`if (!schedRes.ok) throw`)
never actually got to fire, because the route always reported success —
so a report could be fully saved while its schedule row was never touched,
with nothing anywhere surfacing that it happened.

### The fix
`app/api/sched-details/route.ts` now validates its input, checks that the
`UPDATE` actually matched a row (returns 404 if not), and only returns
success when the row was genuinely updated — letting the sync engine's
existing retry-on-failure logic actually do its job.

### Still worth confirming for the specific printer you found
I gave you two diagnostic queries (printer X9LV716795's `scheduleDetails`
row(s) vs. its actual `maintain` record) to pin down whether this exact
case was the silent-failure bug above, or something else (e.g. a stale
`schedDetailsId` from a duplicate row, related to Round 10's finding). If
you'd already filed the report before this fix goes out, it won't
retroactively fix that one row — worth checking whether it needs a manual
correction once we see the query results.

---



No database changes.

### Replaces an existing file
- `components/pages/PendingMaintenancePanel.tsx` — the card now has the
  same expand/collapse header as Unmaintained Printers (defaults
  **expanded** here, since Pending Maintenance is this panel's primary
  purpose on both pages it appears on — Unmaintained Printers defaults
  collapsed since it's the secondary list). Badge wording changed from
  "N outstanding" to "N Pending", with a small Bell icon inside it.
  **Note:** the request referenced an attached bell/notification icon as
  a visual reference, but no image actually came through with that
  message — I used lucide's plain `Bell` icon (the same one already used
  in the topbar notification bell) as a reasonable stand-in. Let me know
  if you had a specific icon in mind.
- `components/OpenIssuesBell.tsx` — the notification count badge (the red
  circle on the topbar bell) now uses explicit `text-white font-bold`
  instead of `text-destructive-foreground font-semibold`, for readability
  at its small size.
- `components/tracker/task-tracker.tsx` — two changes:
  1. Serial No. in the Schedule Details grid is now its own clickable
     button (styled as a link), opening `PrinterHistoryDialog` — the
     exact same modal used on the Printers nav page. This is separate
     from the existing row click, which still opens the Maintenance
     Report PDF once a row is maintained; `stopPropagation` keeps the two
     from firing together.
  2. Mobile layout fix (see `TaskTracker.tsx` below for the root cause) —
     each card now caps at `max-h-[75vh]` below the `lg` breakpoint
     instead of inheriting a shared, too-small height from its parent.
- `components/pages/TaskTracker.tsx` — the actual root cause of the
  cramped mobile layout: the wrapper forced a fixed shared height
  (`h-[calc(100vh-8rem)]`) at every screen size, so on mobile — where the
  two cards stack instead of sitting side by side — both ended up
  squeezed into that one small shared height, each left with almost no
  room to scroll. That height constraint now only applies at `lg` and up,
  where the cards genuinely do sit side by side and need to share a
  bounded height for their internal scroll areas to make sense. Also
  switched to `dvh` (dynamic viewport height) instead of `vh` for that
  large-screen height, which behaves more predictably than `vh` if a
  browser's chrome shows/hides during use.

---



No database changes, but read this one carefully — it's a data issue, not
just a code fix.

### Root cause (corrected twice — see below)
My first hypothesis (a printer with two `deployments` rows both marked
`deployedHere = true`) turned out to be wrong — that diagnostic query came
back empty. The actual cause, confirmed by a screenshot of two identical
"XAGM080560" cards, both showing "Scheduled · Mj Charles Lacosta": a single
maintenance report ended up linked from **two** `scheduleDetails` rows.
`app/api/pending-maintenance/route.ts` joined straight from the report to
`scheduleDetails` on this link with no deduplication, so that one report's
row got multiplied into two identical-looking cards — same key
(`maintain.id`), crashing the grid.

One wrinkle: on `scheduleDetails`, the physical database column is named
`"mtId"` — the Drizzle field is called `originMTId`, but that's just the
JS-side name; raw SQL against this table needs `"mtId"`, not
`"originMTId"`. My first diagnostic query used the wrong one.

**Find every affected report:**
```sql
SELECT "mtId", COUNT(*) AS scheduleDetails_count
FROM "scheduleDetails"
WHERE "mtId" IS NOT NULL
GROUP BY "mtId"
HAVING COUNT(*) > 1;
```
This came back with **30 different reports, every single one linked from
exactly 2 `scheduleDetails` rows — none with 3 or more**. That uniformity
points to a systematic cause (the same code path firing twice for the same
report), not scattered data mistakes.

**Inspect a few of them together, to see if it's the same schedule twice
or two genuinely separate ones:**
```sql
SELECT
  sd.id AS scheduleDetails_id,
  sd."mtId",
  sd."scheduleId",
  s."scheduledAt",
  s."technicianId",
  s."createdAt" AS schedule_created_at
FROM "scheduleDetails" sd
JOIN "schedules" s ON s.id = sd."scheduleId"
WHERE sd."mtId" IN (220, 219, 221, 8, 13)
ORDER BY sd."mtId", s."createdAt";
```
Worth deciding whether any of these reflect a genuine scheduling problem
beyond display — if a printer truly got added to a technician's itinerary
twice for the same report, that technician may see it duplicated on their
own schedule too, which is worth confirming directly with them. I did NOT
clean up the existing duplicate rows for you — a production data decision
like "which row is the stale one" needs your confirmation, not a guess
from me.

### The code fix — two layers
1. **Read-side (`app/api/pending-maintenance/route.ts`)**: now joins
   through a small deduplicated CTE (`scheduleLink`, picking the most-
   recently-created `scheduleDetails` row per report) instead of joining
   `scheduleDetails` directly — so even if a report is (or becomes again)
   linked twice, the grid can't duplicate a row over it.
2. **Write-side (`app/api/schedule/assign/route.ts`)**: the uniform
   "always exactly 2" pattern points at a single insertion point being
   called twice per report, and the most likely one is this route — used
   by Pending Maintenance's "Assign" button, with no protection against
   being called twice for the same report (a fast double-click before the
   button's disabled state took effect, two browser tabs, or a genuine
   repeat click). It now checks whether the report being assigned
   (`maintainId`) is already linked to any `scheduleDetails` row before
   creating a new schedule for it, and rejects with a 409 if so — closing
   this off at the point of insertion instead of relying on every
   downstream query to defend against it. Safe either way: a report never
   legitimately needs to be assigned twice through this endpoint, since
   Pending Maintenance already hides the Assign button once a report
   shows as scheduled.

Also applied, defensively, while investigating (the deployments
hypothesis was wrong, but the SAME kind of "assumed at most one match"
join risk was real elsewhere and is cheap to close preemptively): four
routes now deduplicate their "current deployment" join the same way, in
case that invariant is ever violated too — `app/api/pending-maintenance/
route.ts`, `app/api/unmaintained-printers/route.ts`, `app/api/open-issues/
route.ts`, and `app/api/admin/master/printers/route.ts` (both its page
query and its count query — a deployments duplicate would also inflate
the pagination total there).

Worth checking `app/api/schedule/route.ts`'s two other `scheduleDetails`
insert sites (the main Schedule page's create/edit flow) if new
duplicates keep appearing after this — I didn't add a guard there yet
since I don't have evidence yet that they're involved, and their insert
shape (bulk-inserting several printers per schedule) makes an equivalent
guard a bit more involved to get right without more diagnosis first.



Also applied, defensively, while investigating (the deployments
hypothesis was wrong, but the SAME kind of "assumed at most one match"
join risk was real elsewhere and is cheap to close preemptively):
four routes now deduplicate their "current deployment" join the same way,
in case that invariant is ever violated too — `app/api/pending-maintenance/
route.ts`, `app/api/unmaintained-printers/route.ts`, `app/api/open-issues/
route.ts`, and `app/api/admin/master/printers/route.ts` (both its page
query and its count query — a deployments duplicate would also inflate
the pagination total there).

---



No database changes.

### Replaces an existing file
- `lib/maintenance-status.ts` — added `"For Replacement (Printer Part)"`
  (with parentheses) to `NEEDS_ATTENTION_STATUSES` alongside the existing
  `"For Replacement Printer Part"` (no parens) — both are kept since I
  don't know which one your live `status` table actually uses, and having
  both costs nothing.
- `components/pages/Schedule.tsx` — **found and fixed real drift while
  making that change**: the Open Issues filter here had its own
  hardcoded copy of the status list (`TARGET_STATUSES`) instead of
  importing the shared one, despite `lib/maintenance-status.ts`'s own
  comment claiming this exact site had already been fixed. It hadn't.
  Adding the new status to the shared list alone would NOT have shown up
  in Open Issues — this local copy would have silently filtered it back
  out. Now imports `NEEDS_ATTENTION_STATUS_LIST` instead of duplicating
  it, which also incidentally fixes a pre-existing lint warning about
  this constant.
- `components/UnmaintainedPrintersPanel.tsx` — cards are now clickable,
  opening `PrinterHistoryDialog` for that printer. The Schedule button
  stops the click from bubbling into the card (`e.stopPropagation()`), so
  both actions coexist.
- `components/pages/PendingMaintenancePanel.tsx` — same pattern: cards
  are clickable → Printer History modal; both the Assign button and the
  Resolve button (still gated by `readOnly`/`canResolve` exactly as
  before — untouched by this change) stop propagation so they keep
  working independently of the new card click.
- `components/PrinterHistoryDialog.tsx` — the "Maintenance history" grid
  rows (both the desktop table and the mobile card layout) are now
  clickable, opening the actual Maintenance Report PDF for that specific
  record. This reuses the exact mechanism already used in two other
  places rather than building something new: `components/tracker/
  task-tracker.tsx`'s `handleRowClick` and `components/pages/Report.tsx`'s
  `handlePrintMaintenance` both just call `window.open(apiPath(
  `/api/pdf?mtId=${id}`), "_blank")` — this does the same, using each
  history row's own `id` (which is `maintain.id`), so the report opened
  always matches the exact row clicked.

---



No database changes. `/api/missed-schedules/route.ts` is left on disk,
untouched and unused, same "don't delete, just stop calling it" approach
as the Technician web lockout — nothing else references it anymore.

### New files
- `app/api/unmaintained-printers/route.ts` — the new backing data: every
  currently deployed printer whose LATEST maintenance record (across its
  entire history, any past deployment, not just the current site) is 7+
  days old, or that's never been maintained at all (falls back to its
  deployment date). Sorted longest-overdue first. A printer disappears
  from this the moment a new report is filed for it — the filter is a
  live computed day-count, not a status flag that needs resolving.
- `components/UnmaintainedPrintersPanel.tsx` — the replacement card for
  the Schedule page, in the same collapsible style the old Missed
  Schedules card used. Each entry has a "Schedule" button reusing the
  same Assign dialog Pending Maintenance uses (now exported from
  `PendingMaintenancePanel.tsx` — see below) to create a fresh schedule
  for that printer; not tied to any specific maintenance report, since
  this is a forward-looking "please visit this printer" action.

### Replaces an existing file
- `components/pages/PendingMaintenancePanel.tsx` — substantial cleanup:
  - The "Missed Schedules" card, its query, and its "Reschedule" flow are
    gone entirely — replaced by the file above.
  - Added a `readOnly` prop: hides the Resolve button and skips mounting
    `ResolveDialog` when true. Assign is unaffected — the request asked
    specifically to remove Resolve, not the whole panel's interactivity.
  - `AssignTarget`, `Technician`, `Priority`, and `AssignScheduleModal`
    are now exported so `UnmaintainedPrintersPanel` can reuse the same
    scheduling dialog instead of duplicating it.
  - The Assign dialog's "reschedule" mode/wording is gone too — it was
    only ever reachable from the now-deleted Missed Schedules card, so it
    was dead code once that card was removed. `/api/schedule/assign`'s
    `rescheduledFromScheduleId` param still exists server-side and still
    works if you have another use for it; nothing client-side sends it
    anymore.
- `components/pages/Schedule.tsx` — mounts `<UnmaintainedPrintersPanel />`
  where the old Missed Schedules card used to render, and passes
  `readOnly` to its embedded `<PendingMaintenancePanel />` so Resolve only
  ever appears on the standalone Pending Maintenance nav page.
- `components/pages/PendingMaintenance.tsx` — comment-only update
  (explains the new split); already had no `readOnly` prop and no Missed
  Schedules card reference, so no functional change was needed here —
  removing Missed Schedules from the shared panel component
  automatically removed it from this page too, satisfying that part of
  the request for free.

---



No database changes.

### Replaces an existing file
- `lib/sms.ts` — `getActiveSmsRecipientNumbers()` no longer filters by
  role. Eligibility is now `smsRecipients.isActive` alone; the phone
  number was already sourced live from `users.contactNo` (never a
  separately-typed number), so a profile phone-number update already
  took effect automatically — that part didn't need to change.
- `app/api/admin/master/sms-recipients/route.ts` — removed the POST
  handler's `NOTIFIABLE_ROLES` check that used to reject non-Admin/
  Scheduler users at link time. Any user can be added as a recipient now.
- `components/pages/SmsRecipients.tsx` — the "User" picker no longer
  filters `/api/admin/users` to `?role=Admin,Scheduler`; every user is
  selectable. Updated the page's description text to match the new rule.
- `app/api/admin/users/route.ts` — comment-only update; the role-filter
  query param itself still works (harmless, just no longer used by this
  picker).
- `app/api/attendance/time-in/route.ts` — **found and fixed real drift
  while making this change**: this route had its own inline copy of the
  recipient-lookup query (including the Admin/Scheduler filter) instead
  of actually calling the shared `getActiveSmsRecipientNumbers()` — despite
  that function's own doc comment claiming it had been "extracted from"
  this exact route. It hadn't been wired up. Now it actually calls the
  shared function, which both fixes the role restriction here and closes
  the drift risk the extraction was originally meant to prevent. The Time
  Out and GPS-off-alert routes already called the shared function
  correctly, so they picked up the fix automatically from the `lib/sms.ts`
  change alone — no edits needed there.

---



No database changes. `db/schema.ts` in this zip is unchanged from Round 5.

### Replaces an existing file
- `components/PrinterHistoryDialog.tsx` — modal is now much larger:
  roughly 20% margin per side on large screens (`xl:w-[60vw] xl:h-[80vh]`,
  capped at 1280px so it doesn't balloon on ultrawide monitors), scaling
  down through `lg`/`sm` breakpoints to nearly full-screen on mobile —
  a literal 20% margin on a phone would leave almost nothing to work
  with, which cuts against the "responsive on small screens" ask.
  **Note:** the default `DialogContent` sets `sm:max-w-lg` — overriding
  it required an explicit `sm:max-w-none` in the new className, since
  `twMerge` treats different responsive prefixes as separate class
  groups and won't let a bare `max-w-none` cancel a `sm:`-prefixed one.
  Worth knowing if you customize dialog sizing elsewhere in this app and
  hit the same silent 32rem cap.
  Printer Information is now two rows of two tiles (Serial Number/Model,
  then Client/Print Count) instead of four cramped into one row, each
  tile bigger and allowed to wrap onto two lines instead of truncating.
  The history table switched from `max-w + line-clamp` (the cause of the
  overlapping text in the screenshot) to `table-fixed` with explicit
  percentage column widths and `whitespace-normal break-words`, so long
  Notes/Replacement-Repair text wraps cleanly instead of overlapping.
- `components/pages/AttendanceReport.tsx` — renamed from "Technician
  Attendance Report" to "Attendance Report" (no longer technician-only).
  New "Role" filter dropdown alongside the person picker, populated from
  whichever roles actually have attendance records (not a static list —
  a role filter offering "Scheduler" when nobody with that role has ever
  timed in would just be a dead end). New "Role" column in the results
  grid so records are visually distinguishable by role, not just
  filterable. The person picker ("Technician" → "Person") now sources
  from the new people endpoint below instead of `/api/technicians`,
  which only ever returns Technicians.
- `lib/server/attendance-report-query.ts` — adds a `role` filter
  (combinable with the existing person filter) and returns each row's
  role, shared between the JSON route and the Excel export as before so
  the two can never disagree.
- `app/api/attendance/report/data/route.ts`, `app/api/attendance/report/
  route.ts` — pass the new `role` param through; the Excel export gained
  a "Role" column (and its "Technician" header is now "Name").

### New files
- `app/api/attendance/report/people/route.ts` — returns everyone who has
  AT LEAST ONE attendance record, any role, for the report's person
  picker. Deliberately not reusing `/api/technicians` (which is
  Technician-only and backs the Schedule-assignment picker elsewhere) —
  this is what makes an Admin or Scheduler who's used Timekeep actually
  show up as filterable, without cluttering the list with every Admin
  account that's never timed in.

---



No new tables. `db/schema.ts` in this zip now includes `printCount` on
`maintain` (the field you already restored yourself after the earlier
build error) — it's there for reference/consistency only; you don't need
to do anything with it since you already fixed it. Still never replace
your whole `db/schema.ts` with this snapshot.

### New files
- `app/api/admin/master/printers/[id]/history/route.ts` — backs the new
  modal: current printer info (serial/model/client/print count, model and
  client sourced from the active deployment same as the Printers list) +
  complete maintenance history across every deployment the printer's ever
  had, newest first. The "Replacement/Repair" column combines everything
  checked under the Maintenance Report's "Services" section on that
  visit — Cleaning of Printer, Cleaning of Waste Tank, plus whichever
  parts were marked for Replacement or Repair (labelled
  "(Replace)"/"(Repair)") — comma-separated, matching the same data this
  app's own PDF report already builds from `maintain.cleanPrinter`/
  `cleanWasteTank` and the `replace`/`repair` join tables. (Corrected
  after the first version of this route only pulled the Replacement/Repair
  parts and missed the two Cleaning checkboxes — confirmed against a
  screenshot of the actual "Services" section on the report form.)
- `components/PrinterHistoryDialog.tsx` — the modal itself. A table on
  md+ screens, a stacked card list below that (fully responsive, not just
  horizontally scrollable). Status-driven red/green highlighting via the
  next file.
- `lib/printer-history-status.ts` — the red/green status-name lists from
  the request, plus one alias ("For Replacement Printer Part" without
  parentheses) matching this app's existing `NEEDS_ATTENTION_STATUSES`
  spelling, in case the live `status` table uses that form instead of the
  parenthesized one given in the request.

### Replaces an existing file
- `components/MasterDataManager.tsx` — gained an optional `onRowClick`
  prop (opt-in, every other module using this shared component is
  unaffected). Clicks on the Actions column (Edit/Delete/any `rowActions`)
  are stopped from bubbling into it, so a row-details modal and row-level
  action buttons coexist without one accidentally firing the other.
- `components/pages/Printers.tsx` — wires `onRowClick` to open
  `PrinterHistoryDialog`, mounted alongside the existing
  `PrinterTransferDialog`.
- `components/tracker/task-tracker.tsx` — when a selected schedule has no
  assigned printers (`scheduleDetails` is empty), the Schedule Details
  panel now shows that schedule's own `notes` (from the same list the
  left-hand grid already has loaded — matched by `id`, so it can't show
  the wrong schedule's notes) instead of the old "Please Get Check."
  placeholder. Also cleaned up a pre-existing bug in that empty-state row
  where `selectedId` (a number) was being interpolated directly into a
  `className` string.

---



Round 1 replaced the old `ItinerarySequenceManager` (up/down-button reorder
card) with the current drag-and-drop card grid on the Schedule page — but
two things that component did got left behind in the rewrite. Both are
restored now, adapted to the current card design rather than reverted to
the old up/down-button layout. No database changes in this round.

### Replaces an existing file
- `lib/maps.ts` — `googleMapsDirectionsUrl()` / `openGoogleMapsDirections()`
  now accept `origin: LatLng | null` (was required). Passing `null` omits
  the `origin` param entirely, which makes Google Maps fall back to the
  device's current location — needed for a first stop, which has no
  preceding leg to route from. Checked against its other two callers
  (`components/LocationRoutePlanner.tsx`, `components/pages/
  GpsMonitoring.tsx`) — both already pass a real `LatLng`, so this is a
  backward-compatible widening, not a breaking change.
- `components/ScheduleCard.tsx` — three additions:
  1. A Google Maps navigate icon next to the client/location line on every
     card. For stops after the first, it opens directions FROM the
     previous stop TO this one (the same logic the old component used).
     For the first stop, it opens directions to that stop using the
     device's current location as the start (see `lib/maps.ts` above) —
     the old component simply hid the icon on the first card; this round
     shows it everywhere per the request, disabled with a tooltip when a
     location has no GPS pin configured.
  2. An `isLocked` prop: when true, the card shows a lock icon instead of
     the drag handle and becomes inert for drag-and-drop (not draggable,
     not a valid drop target), while every other card stays freely
     reorderable.
  3. The sequence badge renders a lock icon instead of the number when
     `isLocked` is set.
- `components/pages/Schedule.tsx` — restores the two business rules that
  used to live in `ItinerarySequenceManager`, now driving the card grid
  instead of a separate section:
  - Fetches `/api/attendance/technician-status` (today's date only) the
    same way the old component did, and passes `isLocked` to whichever
    card currently sits first in the drag order once the technician has
    timed in — this is a CLIENT-side mirror only; the actual enforcement
    was never removed from `PATCH /api/schedule/sequence`, which rejected
    a changed first stop the whole time Round 1–3 shipped. Shows the same
    warning banner the old component did.
  - Fetches `/api/location-coordinates` and wires the navigate icon
    described above into each card via a new `handleNavigateStop(idx)`.

---



### New files
- `db/migrations/0060_printer_missing_status_and_resolved.sql` — adds
  `printers.status` and seeds a `"Resolved"` row into the `status` lookup
  table (the same one `maintain.statusId` points into). Idempotent, safe
  to re-run.

### Replaces an existing file
- `app/api/admin/master/printers/[id]/transfer/route.ts` — the Transfer
  Printer endpoint now accepts three actions: `transfer` (unchanged),
  `markMissing`, and `markFound`. A real transfer also clears any existing
  Missing flag automatically — being relocated means it was found.
- `app/api/admin/master/printers/route.ts` — the Printers list now
  selects `status` so the grid can show it.
- `components/PrinterTransferDialog.tsx` — the dialog now has a two-tab
  toggle: "Transfer" (unchanged) and "Mark as Missing" / "Mark as Found"
  (whichever applies given the printer's current status). The Missing tab
  has no location fields — the point is the location is unknown.
- `components/pages/Printers.tsx` — new Status column (a red "Missing"
  badge, or a quiet "Active" label), and passes `status` into the transfer
  dialog's target.
- `app/api/pending-maintenance/[id]/resolve/route.ts` — clicking Resolve
  now updates `maintain.statusId` to `"Resolved"` (in addition to the
  existing audit-trail insert into `maintenanceResolutions`). This is what
  actually removes the item from Pending Maintenance — see the next file.
- `app/api/pending-maintenance/route.ts` — simplified: since a resolved
  report's status is no longer in `NEEDS_ATTENTION_STATUSES`
  (`lib/maintenance-status.ts`), the existing WHERE clause already excludes
  it — no separate "hide resolved" filter needed. Also fixed a pre-existing
  drift bug where this route had its own hardcoded copy of that status list
  instead of importing the shared one.
- `components/pages/PendingMaintenancePanel.tsx` — the action button now
  reads "Resolve" (was "Resolved"), shown unconditionally for Admin/Super
  Admin since every item in this list is guaranteed still-pending by
  construction. Removed the now-dead "Resolved" badge/audit-callout
  rendering, since a resolved item can no longer be returned by the list
  API at all.

### Note: `printers.status` is intentionally narrow
Per the request, "Missing" is set or cleared **only** from the Transfer
Printer dialog's two new actions (and automatically cleared by a real
transfer). Nothing else in the app touches this field — don't wire it into
any other flow without deliberately deciding to widen its meaning.

---

## Round 2 — Super Admin bootstrap access fix

An Admin reaching Role Assignment while no Super Admin exists yet now
actually works end-to-end. Round 1 only wired the bootstrap fallback into
the API layer (`requireSuperAdmin()`) — the sidebar nav filtering had no
way to know about it, so an Admin could never actually SEE or click into
Role Assignment even though the backend would have let them.

### New files
- `app/api/bootstrap-status/route.ts` — tells the dashboard shell (Admin
  role only) whether any Super Admin exists yet, so it can unlock the
  reserved nav links during that window instead of leaving them
  unreachable in the UI while the backend would allow them.

### Replaces an existing file
- `lib/permissions.ts` — `canAccessModule()` gains an optional
  `superAdminBootstrapping` flag so the frontend nav can unlock
  Super-Admin-only links for an Admin during the bootstrap window.
- `app/(root)/dashboard/page.tsx` — fetches `/api/bootstrap-status` (Admin
  role only) and threads the flag through nav filtering.
- `components/pages/RoleAssignment.tsx` — adds a banner explaining to an
  Admin why they can see this screen while no Super Admin exists yet.

---

## Round 1 — the original 9-item feature request

Technician web lockout, Task Tracker, Itinerary drag-reorder, Pending
Maintenance resolve (audit trail), Role Assignment grouping,
Admin/Scheduler Timekeep, Staff GPS Location, Super Admin role, GPS
Monitoring trail fix.

### Delete this file
- `components/ItinerarySequenceManager.tsx` — replaced by inline
  drag-and-drop reordering on the Schedule page's itinerary cards
  (`components/ScheduleCard.tsx` + `components/pages/Schedule.tsx`).
  Nothing else imports it anymore.

### Replaces an existing file
- `lib/require-role.ts` — role implication (Super Admin passes any
  `requireRole(["Admin"])` check — no other route needed editing for
  that), plus `requireSuperAdmin()` with the bootstrap fallback.
- `db/migrations/meta/_journal.json` — registers migrations 0059 and 0060.
- `components/GpsMonitoringGoogleMap.tsx` — fixes the GPS trail not
  drawing: a `mapReady` flag now correctly re-fires the marker/trail/route
  effects once the async Google Maps load actually finishes.
- `app/api/schedule/route.ts` — the Schedule page's GET now selects and
  orders by `sequence`, so the card grid reflects the real itinerary order.
- `components/ScheduleCard.tsx` — drag-and-drop props + sequence badge
  (further extended in Round 3's Printers work — no relation, just the
  same shared component file).
- `components/columns/schedules/columns.tsx` — `Schedule` type gains
  `sequence`.
- `components/pages/Schedule.tsx` — the standalone Itinerary Order card is
  gone; reordering now happens by dragging the cards themselves
  (top-to-bottom, then left-to-right), with a Save Order button beside
  Save/Update that's only enabled once the order actually changed.
- `app/api/schedules/[id]/details/route.ts` + `types/tracker.ts` — adds
  the printer's current Model to Schedule Details.
- `components/pages/TaskTracker.tsx` + `components/tracker/task-tracker.tsx`
  — both cards now fill the available page height; Model column added to
  Schedule Details; Progress column frozen while the table scrolls
  horizontally.
- `app/api/admin/users/route.ts`, `app/api/admin/users/[id]/route.ts`,
  `app/api/admin/master/sms-recipients/route.ts` (+ `[id]`),
  `app/api/attendance/report/route.ts`, `app/api/attendance/report/data/
  route.ts`, `app/api/admin/purge-maintenance/route.ts` (+ `printers`) —
  all gated by `requireSuperAdmin()` instead of a plain Admin check,
  matching the Super-Admin-only nav links (Role Assignment, SMS
  Recipients, Attendance Report, Purge Maintenance).

### New files
- `db/migrations/0059_staff_timekeep_and_resolutions.sql` — creates
  `staffGpsLocations` and `maintenanceResolutions`. Written idempotently.
- `components/TechnicianWebNotice.tsx` — the "Technicians can now use the
  Fiix Technician mobile app" screen shown instead of the dashboard shell.
  Nothing Technician-specific was deleted anywhere in the app — every
  page, route, and API handler a Technician's role can reach is untouched
  and still authorizes exactly as before, since the mobile app calls the
  same API. This closes the web shell only.
- `components/pages/PendingMaintenance.tsx` — standalone nav page wrapping
  the same panel already embedded on Schedule.
- `components/pages/Timekeep.tsx` — Admin/Scheduler Time In/Out screen,
  geofenced against their configured Staff GPS Location pin (gated on
  **both** Time In and Time Out, unlike the Technician flow).
- `components/pages/StaffGpsLocations.tsx` — Super Admin CRUD for each
  Admin/Scheduler's GPS pin.
- `app/api/attendance/staff/status/route.ts`,
  `app/api/attendance/staff/time-in/route.ts`,
  `app/api/attendance/staff/time-out/route.ts` — Timekeep's backend.
  These write to the SAME `technicianAttendance` table the Technician flow
  uses (it was never actually role-specific, just named that way), which
  is why Admin/Scheduler sessions show up in the existing Attendance
  Report with zero changes needed there.
- `app/api/admin/master/staff-gps-locations/route.ts` (+ `[id]/route.ts`)
  — CRUD backing Staff GPS Location, Super Admin only.

(`app/api/pending-maintenance/route.ts`, `app/api/pending-maintenance/
[id]/resolve/route.ts`, and `components/pages/PendingMaintenancePanel.tsx`
were introduced in Round 1 but have since been superseded by Round 3's
versions above — use the Round 3 files, not Round 1's.)

---

## After copying everything into place

```bash
npm run db:migrate
```
against every environment (dev/staging/production), **then** deploy the
code.

## Notes / known limitations

- No drag-and-drop library was added — the itinerary reorder uses native
  HTML5 drag events, which is fine on desktop but does not fire on touch
  devices. Say the word if you want `@dnd-kit` added instead.
- The Attendance Report's technician filter dropdown (`/api/technicians`)
  still only lists Technicians, so Admin/Scheduler Timekeep records show
  up in the report grid (default "All technicians" view) but can't yet be
  filtered to one specific staff member by name.
- `npx next build` fails in my sandbox on `next/font` trying to reach
  `fonts.googleapis.com`, which isn't in the sandbox's allowed-domains
  list — confirmed unrelated to these changes. `tsc --noEmit` and `next
  lint` both come back clean on the full changeset; it would build fine
  with real internet access.
