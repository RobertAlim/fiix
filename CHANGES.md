# Update — 2026-08-29

Attendance Report: controlled editing of the Sign Out value, directly from
the report grid.

## 1. Sign Out editing

- `components/pages/AttendanceReport.tsx` — every row is now clickable
  (the whole `<tr>`, not just an icon). Clicking opens a Popover anchored
  to that row with a Sign Out editor: an `<input type="time">` prefilled
  with the record's current Sign Out (Asia/Manila local time), plus
  Cancel/Save. No other field on the report is editable — Name, Role,
  Itinerary Date, Sign In, and Hours Rendered stay exactly as they were,
  purely computed/read-only.
- A small pencil or lock icon next to the Sign Out value hints, before
  the row is even clicked, whether it's editable for the current viewer.

## 2 & 3. Role rules — Admin restricted, Super Admin unrestricted

Enforced identically in the UI (so the popover shows the right message
up front) and, as the actual boundary, server-side:

- **Super Admin** can edit Sign Out on any record, for any role, whether
  the current value is blank or already populated.
- **Admin** can only edit a record where the person's current role is
  exactly **Technician** — never another Admin's or a Super Admin's
  record (nor their own, since an Admin doesn't hold the Technician
  role). And only when a Sign Out value **already exists** — an Admin
  can correct an existing time, but can't be the one to fill in a blank
  one; that's reserved for Super Admin.

If a row isn't editable for the current user, the popover still opens
(so it can explain why) but shows a message instead of the input —
satisfying "the popover should clearly reflect whether the current user
is authorized," rather than the row silently doing nothing on click.

## 4. Security / guardrails — the real boundary is server-side

Hiding/disabling the input in the popover is only ever a courtesy. The
actual enforcement is a new endpoint:

- **`app/api/attendance/report/[id]/time-out/route.ts`** (new) — `PATCH`,
  requires `requireRole(["Admin", "Super Admin"])`, then re-derives and
  re-checks every rule above from the database (never trusts anything
  the client sent about roles or permissions):
  - Looks up the target attendance record and the CURRENT role of the
    person it belongs to.
  - Super Admin: no further checks.
  - Admin: 403 if the target's role isn't exactly `"Technician"`; 403 if
    the record's existing Sign Out is null.
  - The submitted time (`"HH:mm"`, validated with zod) is combined with
    the record's own shift date and converted from Asia/Manila local
    time to the correct UTC instant with `date-fns-tz`'s `fromZonedTime`
    — the reverse of `convertToPhilippineTimezone` in
    `lib/dateConverter.ts`, which only ever goes the other direction
    (UTC → a Manila-formatted display string). Rejects with 400 if the
    new Sign Out would land before Sign In.
  - A direct API call with a forged/omitted role can't bypass any of
    this — the check is against the caller's own DB-verified role and
    the target record's own DB-verified data, not anything in the
    request body.

### Prerequisite: Admin could not reach this page at all before

The task requires both Admin and Super Admin to use this feature, but
Attendance Report was previously Super-Admin-only end to end. Opened up
just enough for Admin to view the report and use this one editing path
— nothing else about who can do what elsewhere in the app changed:

- `lib/permissions.ts` — `"attendanceReport"` moved out of
  `SUPER_ADMIN_ONLY_MODULES` into the regular Admin module list, so the
  nav link and the page itself are reachable for Admin.
- `app/api/attendance/report/data/route.ts` (on-screen grid),
  `app/api/attendance/report/route.ts` (Excel export), and
  `app/api/attendance/report/people/route.ts` (person picker) — gate
  changed from `requireSuperAdmin()` to
  `requireRole(["Admin", "Super Admin"])`. Super Admin's access is
  unchanged; Admin can now view/generate/export the same report Super
  Admin sees.
- `lib/server/attendance-report-query.ts` — added `id`
  (`technicianAttendance.id`) to the shared row shape. There was
  previously no stable identifier for one specific attendance record;
  the new PATCH endpoint needs it to target the exact row being edited.
  `app/api/attendance/report/data/route.ts`'s JSON response now also
  includes `workDate`, `timeInIso`, and `timeOutIso` alongside the
  existing pre-formatted display strings — the popover needs the raw
  instant to prefill correctly and to know whether a Sign Out value
  exists at all, not just the "—" placeholder used for display.

## What did NOT change

- The Excel export's columns and content are unchanged (Sign Out editing
  only happens from the on-screen grid).
- No change to how Time In/Sign In is recorded or displayed anywhere.
- Scheduler and Technician access to Attendance Report is unchanged —
  Scheduler never had it, Technician is web-blocked entirely (unrelated
  to this change).

## Verification

- `npx tsc --noEmit -p tsconfig.json` — clean, no errors.
- `npx next lint` — no new warnings; only the same pre-existing warnings
  as before these changes (scan-qrcode `<img>`, a few `exhaustive-deps`
  hooks in CameraCapture/Maintenance/Schedule, `alt-text` in
  MaintainReport).

## Files in this delta

```
lib/permissions.ts                                    (modified)
lib/server/attendance-report-query.ts                 (modified)
app/api/attendance/report/data/route.ts                (modified)
app/api/attendance/report/route.ts                     (modified)
app/api/attendance/report/people/route.ts               (modified)
app/api/attendance/report/[id]/time-out/route.ts        (new)
components/pages/AttendanceReport.tsx                   (modified)
```

Copy these files into your project at the exact same relative paths — no
other files are touched.
