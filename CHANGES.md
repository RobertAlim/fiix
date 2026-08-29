# Update — 2026-08-29

Three UI/usability fixes: Printers Status filter, horizontal scrolling on
six data grids, and mobile nav auto-close.

## 1. Printers — Status filter

- `components/MasterDataManager.tsx` — `FilterConfig` gained an optional
  `type?: "text" | "select"` (default `"text"`, so every existing filter
  across the app is unchanged) and `options?: { value; label }[]`. A
  `"select"` filter renders as a dropdown (shadcn `Select`) instead of a
  free-text box — appropriate for a column with a small fixed set of
  values, where a substring filter is both unnecessary and, for values
  that are substrings of each other, actually wrong (see below).
- `components/pages/Printers.tsx` — added a `status` filter (`type:
  "select"`) with the same three options as the Status column's own badges
  and the Edit Printer form: Active / Inactive / Missing.
- `app/api/admin/master/printers/route.ts` — the `GET` handler now reads
  `?status=` and filters with an **exact** match (`eq`, not `ilike`).
  Deliberately not a substring match: "Active" is a substring of
  "Inactive", so filtering for Active printers with `ilike` would have
  incorrectly also returned Inactive ones. An unrecognized value is
  silently ignored, same as any other filter here.

## 2. Fix horizontal scrolling — Task Tracker, Data Imports, Printers,
   Client Locations, Staff GPS Location, SMS Recipients

Root cause: every one of these grids' tables were wrapped in a Radix
`ScrollArea` for vertical scrolling — but `Table` (`components/ui/table.tsx`)
already wraps *itself* in its own horizontal Radix `ScrollArea`. Nesting a
vertical-only `ScrollArea` around an already horizontal-scrolling `Table`
breaks the horizontal scrolling: `@radix-ui/react-scroll-area`'s Viewport
only ever sets `overflow-x: scroll` when a horizontal scrollbar is also
mounted on that same `ScrollArea` instance — otherwise it sets
`overflow-x: hidden`, unconditionally. A vertical-only outer `ScrollArea`
therefore clips the inner `Table`'s wider content instead of letting it
scroll, regardless of how correctly the inner `Table` computes its own
overflow.

- `components/MasterDataManager.tsx` — the outer `ScrollArea` wrapping every
  grid's `Table` is now a plain `<div className="max-h-[65vh]
  overflow-y-auto">`. This single shared component backs Data Imports,
  Printers, Client Locations, Staff GPS Location, and SMS Recipients, so
  fixing it here fixes all five pages at once. The inner `Table`'s own
  horizontal Radix `ScrollArea` is untouched and now works exactly as it
  does everywhere else it's used standalone — same column widths
  (`minWidth`), same pinned Actions column, same responsive behavior.
- `components/tracker/task-tracker.tsx` — Task Tracker has its own two
  tables (Schedules and Schedule Details) with the identical nested-
  `ScrollArea` pattern; both outer `ScrollArea`s are now the same plain
  `overflow-y-auto` div, for the same reason. The now-unused `ScrollArea`
  import was removed from this file (`MasterDataManager.tsx` still uses
  `ScrollArea` elsewhere — its Add/Edit form dialog — so that import stays
  there).

No column layout, column widths, pinned-Actions behavior, or responsive
breakpoints changed on any of these grids — only how the vertical scroll
region is implemented, which no longer interferes with the horizontal one.

## 3. Mobile navigation — auto-close menu on link selection

- `app/(root)/dashboard/page.tsx` — the mobile nav `Sheet` was previously
  uncontrolled (Radix opened/closed it itself via the trigger, overlay
  click, or Escape only). It's now controlled with a `mobileNavOpen` state,
  and `SheetNav` takes a new `onNavigate` callback — called immediately
  after `setActivePage(key)` on every nav item's `onClick`, and on the
  Profile link's `onClick` — which closes the Sheet. Selecting any link now
  dismisses the menu right away while the chosen page loads underneath,
  instead of leaving the overlay open until separately dismissed. Applied
  uniformly to every link in the mobile nav (all page nav items + Profile).
  The desktop sidebar (`NavList`) is unaffected — it was never inside a
  Sheet.

## Verification

- `npx tsc --noEmit -p tsconfig.json` — clean, no errors.
- `npx next lint` — no new warnings; only the same pre-existing warnings as
  before these changes.

## Files in this delta

```
app/(root)/dashboard/page.tsx                    (modified)
app/api/admin/master/printers/route.ts           (modified)
components/MasterDataManager.tsx                 (modified)
components/pages/Printers.tsx                    (modified)
components/tracker/task-tracker.tsx              (modified)
```

Copy these files into your project at the exact same relative paths — no
other files are touched.
