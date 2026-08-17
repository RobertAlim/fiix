# Fiix web app updates — apply into your repo at these exact paths

Supersedes nothing earlier — this is on top of your existing repo at commit
024710f, plus everything from the prior three delivery rounds. Organized by
round below so you can tell what's new in THIS zip vs. what you should
already have applied. Round 4 has no database changes — skip straight to
"Round 4" below if you've already applied Rounds 1–3.

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

### Verify before building

```bash
grep -n "export const staffGpsLocations\|export const maintenanceResolutions\|status: varchar(\"status\"" db/schema.ts
```
You should get three hits total. Zero on any of them means that edit didn't
land — check you saved the right file.

---

## Round 4 — Restored itinerary features lost when Round 1 rebuilt the card grid

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
