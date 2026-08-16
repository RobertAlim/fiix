# Fiix web app updates — apply into your repo at these exact paths

This is the CURRENT, COMPLETE set for the 9-item feature request (Technician
web lockout, Task Tracker, Itinerary drag-reorder, Pending Maintenance
resolve, Role Assignment grouping, Admin/Scheduler Timekeep, Staff GPS
Location, Super Admin role, GPS Monitoring trail fix), PLUS a follow-up fix:
the Super Admin bootstrap window (an Admin reaching Role Assignment while no
Super Admin exists yet) now actually works end-to-end. The original delivery
only wired the bootstrap fallback into the API layer (`requireSuperAdmin()`)
— the sidebar nav filtering had no way to know about it, so an Admin could
never actually SEE or click into Role Assignment even though the backend
would have let them. See "New files" / "Replaces an existing file" below for
the three files this touches (`lib/permissions.ts`, `app/(root)/dashboard/
page.tsx`, `components/pages/RoleAssignment.tsx`) plus the new
`app/api/bootstrap-status/route.ts`.

Supersedes nothing earlier — this is on top of your existing repo at commit
024710f.

## Delete this file first

- `components/ItinerarySequenceManager.tsx` — replaced by inline
  drag-and-drop reordering on the Schedule page's itinerary cards
  (components/ScheduleCard.tsx + components/pages/Schedule.tsx). Nothing
  else imports it anymore.

## ⚠️ Append to an existing file — do NOT replace it

- `db/schema.ts` — **the copy in this zip is a full-file snapshot taken
  from an earlier upload and may be missing columns your live repo has
  gained since** (this bit a prior user: their `maintain.printCount`
  column was wiped out by overwriting the whole file). Do not copy this
  file over your real one. Instead, open your ACTUAL current
  `db/schema.ts` and paste only the two new table blocks
  (`staffGpsLocations` and `maintenanceResolutions`, plus their leading
  doc comments) onto the end of it. Those two blocks are the entire diff
  this delivery makes to schema.ts — everything else in the shipped copy
  was already your code, unmodified, as of the last upload.

## Replaces an existing file

- `lib/permissions.ts` — adds the Super Admin role, new module keys
  (Pending Maintenance, Timekeep, Staff GPS Location), closes the web
  shell to Technician (`MODULE_ACCESS.Technician = []`), and gives
  `canAccessModule()` an optional `superAdminBootstrapping` flag so the
  frontend nav can unlock Super-Admin-only links for an Admin during the
  bootstrap window, mirroring the server-side fallback below.
- `lib/require-role.ts` — role implication (Super Admin passes any
  `requireRole(["Admin"])` check — no other route needed editing for
  that), plus `requireSuperAdmin()` with a bootstrap fallback that lets an
  Admin into Super-Admin-only modules until the first Super Admin exists.
- `db/migrations/meta/_journal.json` — registers migration 0059.
- `app/(root)/dashboard/page.tsx` — new nav entries (Pending Maintenance,
  Timekeep, Staff GPS Location), Technician web-lockout guard, and fetches
  `/api/bootstrap-status` (Admin role only) to unlock the reserved nav
  links during the Super Admin bootstrap window.
- `components/pages/RoleAssignment.tsx` — cards are now grouped by role
  (Super Admin → Admin → Scheduler → Technician → Unassigned), plus a
  banner that explains to an Admin why they can see this screen while no
  Super Admin exists yet.
- `components/GpsMonitoringGoogleMap.tsx` — fixes the GPS trail not
  drawing: a `mapReady` flag now correctly re-fires the marker/trail/route
  effects once the async Google Maps load actually finishes.
- `app/api/schedule/route.ts` — the Schedule page's GET now selects and
  orders by `sequence`, so the card grid reflects the real itinerary order.
- `components/ScheduleCard.tsx` — drag-and-drop props + sequence badge.
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
- `app/api/pending-maintenance/route.ts` + `components/pages/
  PendingMaintenancePanel.tsx` — adds the resolution audit trail (who,
  when, notes) and an Admin-only Resolve button/dialog.
- `app/api/admin/users/route.ts`, `app/api/admin/users/[id]/route.ts`,
  `app/api/admin/master/sms-recipients/route.ts` (+ `[id]`),
  `app/api/attendance/report/route.ts`, `app/api/attendance/report/data/
  route.ts`, `app/api/admin/purge-maintenance/route.ts` (+ `printers`) —
  all now gated by `requireSuperAdmin()` instead of a plain Admin check,
  matching the Super-Admin-only nav links (Role Assignment, SMS
  Recipients, Attendance Report, Purge Maintenance).

## New files

- `db/migrations/0059_staff_timekeep_and_resolutions.sql` — creates
  `staffGpsLocations` and `maintenanceResolutions`. Written idempotently
  per this project's standing migration convention.
- `app/api/bootstrap-status/route.ts` — tells the dashboard shell (Admin
  role only) whether any Super Admin exists yet, so it can unlock the
  reserved nav links during that window instead of leaving them
  unreachable in the UI while the backend would allow them.
- `components/TechnicianWebNotice.tsx` — the "Technicians can now use the
  Fiix Technician mobile app" screen shown instead of the dashboard shell.
  Nothing Technician-specific was deleted anywhere in the app — every
  page, route, and API handler a Technician's role can reach is untouched
  and still authorizes exactly as before, since the mobile app calls the
  same API. This closes the web shell only.
- `components/pages/PendingMaintenance.tsx` — new standalone nav page
  wrapping the same panel already embedded on Schedule.
- `components/pages/Timekeep.tsx` — Admin/Scheduler Time In/Out screen,
  geofenced against their configured Staff GPS Location pin (unlike the
  Technician flow, gated on **both** Time In and Time Out per this
  request).
- `components/pages/StaffGpsLocations.tsx` — Super Admin CRUD for each
  Admin/Scheduler's GPS pin.
- `app/api/pending-maintenance/[id]/resolve/route.ts` — records the
  resolution audit trail.
- `app/api/attendance/staff/status/route.ts`,
  `app/api/attendance/staff/time-in/route.ts`,
  `app/api/attendance/staff/time-out/route.ts` — Timekeep's backend.
  These write to the SAME `technicianAttendance` table the Technician flow
  uses (it was never actually role-specific, just named that way), which
  is why Admin/Scheduler sessions show up in the existing Attendance
  Report with zero changes needed there.
- `app/api/admin/master/staff-gps-locations/route.ts` (+ `[id]/route.ts`)
  — CRUD backing Staff GPS Location, Super Admin only.

## After copying everything into place

```bash
npm run db:migrate
```
against every environment (dev/staging/production), **then** deploy the
code.

## Notes / known limitations

- No drag-and-drop library was added — the itinerary reorder uses native
  HTML5 drag events, which is fine on desktop (the Scheduler's normal
  workflow) but does not fire on touch devices. Say the word if you want
  `@dnd-kit` added for mobile/tablet support instead.
- The Attendance Report's technician filter dropdown (`/api/technicians`)
  still only lists Technicians, so Admin/Scheduler Timekeep records show
  up in the report grid (default "All technicians" view) but can't yet be
  filtered to one specific staff member by name. Widening that dropdown
  was left out to avoid touching `/api/technicians`, which several other
  Technician-assignment flows also depend on.
- `npx next build` fails in my sandbox on `next/font` trying to reach
  `fonts.googleapis.com`, which isn't in the sandbox's allowed-domains
  list — confirmed unrelated to these changes (same pre-existing
  limitation noted from earlier sessions). `tsc --noEmit` and `next lint`
  both come back clean on the full changeset; it would build fine with
  real internet access.
