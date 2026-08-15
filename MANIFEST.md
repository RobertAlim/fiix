# Web app updates — apply into your fiix repo at these exact paths

Combines two batches from this conversation: GPS trail history (for GPS
Monitoring) and location-scoped signatories. `db/schema.ts` already has
BOTH changes merged into one file — don't apply it twice, and don't
re-apply the earlier GPS-only patch on top of this one (this supersedes
it).

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

## After copying everything into place

```bash
npm run db:migrate
```
against every environment (dev/staging/production), **then** deploy the
code. The routes reach for `technicianGpsPings` and
`signatories.locationId` immediately — deploying code before migrating
will error on first use of either.
