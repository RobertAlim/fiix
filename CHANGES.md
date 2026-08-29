# Update — 2026-08-29

Schedule page: past-dated schedules are now read-only.

## What "past" means

A schedule dated strictly before today (Asia/Manila time — same source of
"today" the page's existing first-stop lock already uses,
`phTodayDateString()` from `lib/attendance.ts`) is treated as history. It
either happened or it didn't; nothing about it should still be editable
after the fact. Today's and future schedules are completely unaffected —
this only locks a date once it's fully in the past.

Viewing stays available throughout: schedule details, the itinerary, and
per-printer status are all still visible for a past schedule. Only the
controls that would CHANGE the record are gated.

## Client-side (`components/pages/Schedule.tsx`)

- New derived flag `scheduledAtIsPast`, computed the same way as the
  existing `scheduledAtIsToday`.
- `areControlsEnabled` (gates the Client/Location/Priority/Notes fields in
  the edit form) now also requires `!scheduledAtIsPast`. A brand-new
  schedule is unaffected — it can't be dated in the past to begin with
  (the existing `handleSchedule` guard already blocks that for both create
  and update).
- The Save/Update button is hidden (not just disabled) when editing an
  existing schedule whose date has passed — there's nothing left to save.
- The "Save Order" (drag-reorder) button is hidden for a past date.
- `handleDeleteSchedule`, `handleReschedule`, `handleSaveOrder`, and
  `handlePrinterToggle` each got an early-return guard + toast, as
  defense-in-depth beyond just hiding the buttons that trigger them.

## `components/ScheduleCard.tsx`

- New `readOnly` prop. When set:
  - The card's dropdown menu hides Edit, Delete, and Reschedule — "Show
    Details" stays, since viewing is always allowed.
  - The card becomes undraggable (same mechanism as the existing
    `isLocked` first-stop lock, but for a different reason — the two are
    independent).
  - Shows a small "Read-only" indicator (lock icon) so it's visually
    obvious without opening the menu.

## `components/PrinterStatusCard.tsx`

- New `readOnly` prop (passed alongside the spread `{...printer}`, not
  part of the `Printer` type itself). When set, clicking the card to
  add/remove it from the schedule is blocked (with an explanatory toast,
  same UX pattern as the existing "already maintained" / "already
  assigned elsewhere" guards on this same card) and the hover/click
  affordance is removed — while still showing whether the printer was
  actually part of the schedule (the point of viewing it).

## Server-side — the real boundary, not just UI

Hiding/disabling buttons on the client is only ever a courtesy; each of
these already had (or now has) the actual enforcement server-side:

- `app/api/schedule/route.ts`
  - The "Update Schedule" branch of `POST` now looks up the existing
    schedule's date BEFORE writing, and rejects with 403 if it's already
    past.
  - The `Reschedule` branch (also `POST`) rejects with 403 if the
    original schedule being rescheduled is dated in the past — rescheduling
    changes that record's outcome, so it's an edit like any other.
  - `DELETE` now checks the schedule's date first and rejects with 403 if
    it's past (previously only checked for already-completed maintenance
    tasks).
  - `handleSchedule` on the client already blocked backdating any
    create/update — unchanged, kept as a first-line check.
- `app/api/schedule/sequence/route.ts` (the itinerary drag-reorder PATCH)
  now rejects with 403 if the day being reordered is in the past. This
  supersedes an old, now-outdated comment/behavior that deliberately
  *allowed* reordering history "for correcting old records" — under the
  new requirement that's no longer the intended behavior.

## Verification

- `npx tsc --noEmit -p tsconfig.json` — clean, no errors.
- `npx next lint` — no new warnings; only the same pre-existing warnings as
  before these changes.

## Files in this delta

```
components/pages/Schedule.tsx              (modified)
components/ScheduleCard.tsx                (modified)
components/PrinterStatusCard.tsx           (modified)
app/api/schedule/route.ts                  (modified)
app/api/schedule/sequence/route.ts         (modified)
```

Copy these files into your project at the exact same relative paths — no
other files are touched.
