# Web app updates — apply into your fiix repo at these exact paths

This is the CURRENT, COMPLETE set — supersedes every earlier web-updates
zip from this conversation. Combines three deltas: GPS trail history,
location-scoped signatories, and the `maintain.signPath` NOT NULL/default
fix. `db/schema.ts` has all three merged into one file — don't reapply
any earlier schema.ts you may still have from a previous delivery.

## Replaces an existing file
(back up first if you've edited these locally since your last deploy)

- `db/schema.ts`
- `db/migrations/meta/_journal.json`
- `app/api/gps/ping/route.ts`
- `app/api/signatories/route.ts`
- `components/pages/GpsMonitoring.tsx`
- `components/GpsMonitoringGoogleMap.tsx`

## New files

- `app/api/gps/history/route.ts` (the `history/` folder doesn't exist yet — create it)
- `db/migrations/0056_technician_gps_pings.sql`
- `db/migrations/0057_signatories_location.sql`
- `db/migrations/0058_maintain_signpath_default.sql`

## What 0058 actually is

Not a new constraint — `maintain.signPath` already has a real NOT NULL
constraint in production right now (confirmed via a live Postgres 23502
violation). `db/schema.ts` just didn't declare it, which was the actual
drift. This migration adds a DB-level `DEFAULT 'Unsigned'` on top of that
existing constraint — `"Unsigned"` is the app's established sentinel for
"no signature captured yet," already checked in at least eight places
across the codebase. This is defense-in-depth: any client that ever
forgets to send `signPath` explicitly now gets the correct sentinel
automatically instead of crashing the insert.

## After copying everything into place

```bash
npm run db:migrate
```
against every environment (dev/staging/production), **then** deploy the
code.
