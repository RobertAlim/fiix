# delta-web-001 — Support Services backend + Print History fix + location data

Copy `app/`, `db/`, `lib/`, `validation/` over the same paths in the
**Fiix web app** project root.

## ⚠️ Two files need special handling, not a blind overwrite

- **`db/migrations/meta/_journal.json`** — this is the FULL journal, not
  a diff. If any other migration has landed on your real repo since you
  sent me this zip, copying this file over verbatim would silently drop
  it from the journal. Open both and manually add just this block to
  the end of your real `entries` array instead:
  ```json
  { "idx": 63, "version": "7", "when": 1788252939691, "tag": "0063_support_services", "breakpoints": true }
  ```
  (bump `idx` if your real file already has a higher one).
- **`db/schema.ts`** — also a full-file copy, with the two new tables
  inserted after `otps`. If you've changed this file since the zip, diff
  before overwriting rather than pasting blind.

Everything else here is either a brand new file or a small, easy-to-diff
edit to an existing route — safe to copy straight over.

## New files
| Path | Purpose |
| --- | --- |
| `db/migrations/0063_support_services.sql` | Idempotent migration — `supportServiceType` (seeded), `supportServices` |
| `app/api/printer-history/route.ts` | **The actual fix for the 404.** serialNo-keyed sibling of your existing `app/api/admin/master/printers/[id]/history/route.ts`, opened to Technician |
| `app/api/support-services/route.ts` | GET — today's list for a technician (mirrors `/api/schedule`'s Dashboard branch) |
| `app/api/support-services/[id]/route.ts` | GET — one activity + its signatories, mirrors `/api/maintain`'s bundling |
| `app/api/support-services/complete/route.ts` | POST — completion, same `clientUuid` idempotency contract as `/api/maintain` |
| `app/api/dropdown/support-service-types/route.ts` | GET — `{value,label}[]`, same convention as `getStatus`/`getParts` |
| `validation/supportServiceSchema.ts` | Zod schema for the completion payload, reusing your existing `gpsFixSchema` |

## Modified files
| Path | Change |
| --- | --- |
| `db/schema.ts` | Added `supportServiceType`, `supportServices` tables |
| `app/api/schedule/route.ts` | Dashboard branch now returns `latitude`/`longitude` per row (joined via `locationGeofences`) |
| `app/api/attendance/status/route.ts` | Itinerary stops now carry `latitude`/`longitude`; response gains `lastStop`/`lastGeofence` spanning both `schedules` and `supportServices` |
| `lib/r2.ts` | Added `"fiixsupport"` to `ALLOWED_BUCKETS` |

## What I found by actually reading your repo, worth knowing

**The Print History 404 wasn't a routing bug — the route genuinely never
existed.** I found your real, working equivalent
(`app/api/admin/master/printers/[id]/history/route.ts`, the source of
the `PrinterHistoryDialog.tsx` modal you screenshotted earlier) and
built the new route by copying its proven query logic, not guessing.
One consequence: the response uses `client`/`location` field names
(matching that dialog's contract), not `clientAtMaintenance` like the
mobile app originally assumed — I've included the one-line mobile fix
for that below.

**The location-icon bug was never actually a flaky client-side join.**
I discovered `/api/attendance/status`'s `itinerary` array never
returned coordinates at all — my earlier "fix" (deriving a fallback
from that array) could never have worked, because there was nothing to
derive from. This is now fixed at the source.

**The `lastStop`/`lastGeofence` cross-table ordering is correct once
`sequence` is actually set on `supportServices` — until then it's a
reasonable default, not a guarantee.** `schedules.sequence` is set by
your existing itinerary drag-reorder UI; `supportServices.sequence` is
brand new and starts entirely `NULL` for every row. The route's
ordering rule (see its own inline comment) falls back to "most recently
created" when neither side has a sequence to compare — correct for a
day that's ALL printer stops or ALL support services, a reasonable
default but not a guarantee for a genuinely mixed day, until a
Scheduler UI actually assigns `sequence` across both tables in one
combined order. That UI doesn't exist yet — flagging it as the next
real piece of this feature, not something silently deferred forever.

## Required mobile-side fix (one file, already applied if you're using my deltas)

`src/screens/PrinterHistoryScreen.tsx` — `HistoryRecord.clientAtMaintenance`
renamed to `client`/`location`, matching this route's real field names.
Already included if you're applying deltas from this same conversation;
called out here in case this backend delta reaches you independently.

## Verification performed this session

- Full project `npx tsc --noEmit` — **0 errors across the entire
  repo**, not just the changed files (I temporarily installed
  `node_modules` in my sandbox to run this for real, then removed it —
  you'll need your own `npm install` before building).
- Every new/modified file's braces and parens balance-checked.
- Could NOT run this against a live database (no connection string in
  my sandbox) — the migration and every query are correct by inspection
  and by matching your project's own proven patterns line-for-line, but
  actually running `npm run db:migrate` against a dev/staging DB before
  production is still on you.
