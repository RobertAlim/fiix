# Offline-First Maintenance Reports with Mandatory GPS

Technicians in the field often have slow or no connectivity. This feature makes
the maintenance-report save flow **offline-first**: every report is verified
with GPS, persisted to the device instantly, and synchronized to the server
automatically — no manual "Sync" button, and no report is ever lost.

## Save pipeline (what happens on "Save Maintenance")

1. **Browser support check** — Geolocation + IndexedDB are hard requirements;
   Service Worker / Background Sync are progressive enhancements (foreground
   sync covers browsers without them).
2. **Permission check** (Permissions API) — `denied` blocks saving with an
   instructions dialog; `prompt` lets the capture call raise the browser ask.
3. **GPS capture** — `watchPosition` with `enableHighAccuracy: true`, refining
   until accuracy ≤ threshold (default **50 m**, configurable) or timeout
   (default 30 s). Distinguishes permission-denied / location-services-off /
   timeout / poor accuracy, each with its own user message.
4. **Reverse geocode (best-effort)** — resolved immediately when online via
   `/api/reverse-geocode`; deferred when offline (server resolves it during
   sync — it is online by definition while handling the request).
5. **Local persistence** — report payload, GPS fix, geocode, nozzle photo Blob
   and signature Blob are written to IndexedDB (Dexie) in one transaction.
   The Save button confirms as soon as this completes (< 1 s) — it **never**
   waits for uploads or the database.
6. **Queue for sync** — a Background Sync is registered and a foreground cycle
   is kicked fire-and-forget.

## Sync engine (`features/offline-sync/sync-engine.ts`)

Runs identically in the window (foreground) and the service worker
(`worker/index.ts`, Background Sync tag `fiix-report-sync`), operating on the
same IndexedDB queue. Per report: presign + PUT nozzle photo → R2, presign +
PUT signature → R2, POST report + GPS to `/api/maintain`, link the schedule
detail, resolve deferred geocode, then delete the local Blobs and mark
Completed. Statuses: Pending → Waiting for Connection → Uploading Images →
Uploading Signature → Uploading Report → Completed / Retrying / Failed.

**Retry:** exponential backoff 30 s → 1 m → 2 m → 5 m → 10 m, then every 10 m
forever. Reports are never discarded; "Failed" (after 5 attempts) is a UI
label, not a terminal state.

**Triggers (no manual sync needed):** `online` event, 60 s interval while the
app is open, tab-becomes-visible, and the Background Sync API when the app is
closed. All wired in `features/offline-sync/OfflineSyncProvider.tsx`.

## Idempotency (duplicate prevention)

Each report gets a client-generated UUID at save time (`maintain.clientUuid`,
UNIQUE). Replayed syncs — retries, window/worker races, multi-tab — hit the
unique index; the server returns the existing id and backfills the GPS row if
a prior attempt crashed between inserts. R2 object keys are also UUIDs
generated locally once, so re-uploads overwrite the same object rather than
creating duplicates.

## Database

Migration `db/migrations/0047_broken_loa.sql` (registered in the drizzle
journal — apply with `npm run db:migrate`, or run the SQL directly in Neon).

`npm run db:migrate` runs `db/migrate.ts`, a small script calling
`drizzle-orm`'s own neon-http `migrate()` function directly, **not** the
`drizzle-kit migrate` CLI command. That's deliberate: `drizzle-kit`'s CLI has
documented, unresolved driver-selection problems against Neon specifically —
it can hang or exit without applying anything and without a clear error,
regardless of connection string (see drizzle-orm issue #3128 and neondatabase
issue #5098). `db/migrate.ts` uses the exact same neon-http driver
`db/index.ts` already uses for every query, so there's no separate
driver-selection step to go wrong, and it fails fast and loud on a bad
connection instead of hanging silently.

**Migrations still need Neon's direct (unpooled) connection string** — set
`DATABASE_URL_UNPOOLED` in `.env.local` to the "Direct connection" string
from the Neon dashboard (same project/branch, no `-pooler` in the hostname).
Both `drizzle.config.ts` (used by `db:generate`) and `db/migrate.ts` prefer it
automatically when present, falling back to `DATABASE_URL`.

- `maintain.clientUuid` (uuid, UNIQUE) — idempotency key.
- `maintenance_location` — normalized GPS per report: coordinates, accuracy,
  altitude/heading/speed, short `locationName` (e.g. "Camella Del Rio Talon
  Dos Las Piñas City"), `formattedAddress`, city/province/country/postal,
  `capturedAt`, `gpsProvider`, `isMockLocation`, `reverseGeocoded`.
- `maintenance_sync_events` — server-side audit trail keyed by clientUuid:
  created-offline, gps-acquired, reverse-geocoded, photo-uploaded,
  signature-uploaded, maintenance-synced, retry-attempt, sync-completed,
  server-received, sync-replayed. The device audit trail (IndexedDB) ships to
  the server on sync, so history survives local cleanup.

## Reverse geocoding

Server-side proxy (`lib/geocoder.ts`), defaults to OpenStreetMap Nominatim.
For production volume, point `GEOCODER_BASE_URL` (+ `GEOCODER_USER_AGENT`) at
a commercial provider with the same response shape, or adapt the mapper —
Nominatim's public instance is rate-limited (~1 req/s) and requires a
descriptive User-Agent. Coordinates are always the source of truth; a failed
geocode never blocks or loses a report.

## Offline itinerary browsing & reference-data caching

Beyond the report-save pipeline above, the app also has to work when a
technician *opens* the Maintenance page with no connection — tapping an
itinerary item, viewing client/signatory data, etc. This is handled by a
second, separate cache (`features/offline-sync/reference-cache.ts`), distinct
from the pending-report queue:

- **`cachedJsonFetch(url, key)`** — the general-purpose primitive. Online: hits
  the network and writes the result to IndexedDB (`refCache` table); offline,
  or if the request itself fails, falls back to the last cached value.
  Throws `OfflineCacheMissError` only when nothing has ever been cached for
  that key, so callers can show a specific "connect once to cache this"
  message instead of a generic network error.
- **Prefetch** — `prefetchItineraryData()` runs automatically
  (`TechnicianSchedules.tsx`) the moment a technician's itinerary loads while
  online: one `/api/maintain?serialNo=` lookup per assigned printer (which
  bundles client/location/department/model + that client's signatories in one
  response), plus the clients list and the parts/status dropdowns. A small
  status line ("Caching…" / "Available offline") shows progress.
- **What's cached:** the itinerary list itself (`useSchedules`), per-printer
  maintain lookups, the clients list, and the parts/status dropdowns used on
  the Dashboard shell.
- **Maintenance page behavior offline:** `onHandleScan` (which runs
  automatically when a printer is opened, and again on a manual QR scan)
  skips the network entirely when offline and reads straight from the cache.
  The server-only "already maintained today" duplicate check can't be
  verified without a connection and is skipped in that path — the server
  still enforces it when the report syncs.
- **QR scanner gating:** scanning a *new* printer not on the itinerary
  requires the live lookup, so the floating scan button is disabled (dimmed,
  with a `WifiOff` icon and tooltip) whenever `useConnectivity().online` is
  false, and re-enables the instant connectivity returns. The inline
  "Replace Service Unit" scan button is unaffected — it only records a serial
  number locally and never touches the network.
- **Limitation:** a printer never opened while online (so never prefetched)
  has no cached data to fall back to; the technician sees a clear message
  asking them to connect once and reopen it, rather than a raw fetch error.

## Configuration (all optional)

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_GPS_ACCURACY_THRESHOLD_M` | 50 | Reject fixes less accurate than this |
| `NEXT_PUBLIC_GPS_TIMEOUT_MS` | 30000 | GPS acquisition timeout |
| `NEXT_PUBLIC_GPS_MAX_AGE_MS` | 15000 | Max age of a cached position |
| `NEXT_PUBLIC_SYNC_INTERVAL_MS` | 60000 | Foreground sync interval |
| `GEOCODER_BASE_URL` | Nominatim | Reverse-geocoding provider |
| `GEOCODER_USER_AGENT` | Fiix UA | Identify the app to the provider |

## PWA

`@ducanh2912/next-pwa` generates the service worker (disabled in dev);
`worker/index.ts` is bundled in as the Background Sync handler. Runtime
caching is deliberately conservative: `/api/*` is NetworkOnly (authenticated
data is never served stale), static assets are cached, navigations are
NetworkFirst. Offline capability for report *data* comes from IndexedDB, not
the HTTP cache — the technician must have the app open/loaded before going
offline; cold-starting the whole authed app offline is out of scope.
Generated files (`public/sw.js`, `public/worker-*.js`) are gitignored and
rebuilt on every `next build`. Placeholder icons live at
`public/assets/icon-192.png` / `icon-512.png` — replace with branded ones.

## Mock-location note

Standard browsers do not expose mock-location detection; `isMockLocation` is
stored (default false) for a future WebView/native bridge that can report it.
Server-side, coordinates and accuracy are Zod-validated for sanity
(lat/lng ranges, positive accuracy ≤ 10 km).

## Manual test plan

1. **Online save** — fill a report, Save: GPS dialog narrates the pipeline,
   success toast shows the resolved location name, header chip flips
   🟡 → 🔵 → 🟢 within seconds, `maintain` + `maintenance_location` rows exist.
2. **Offline save** — DevTools → Network → Offline, Save: instant "saved on
   this device" toast, Dashboard shows Offline Mode Active / 1 Pending / 2
   Queued Uploads. Go online: auto-sync without any click, chip turns 🟢.
3. **Closed-tab sync** — save offline, close the tab, restore connectivity:
   Background Sync flushes the queue (verify the row appears in Neon).
4. **GPS denial** — block location for the site, Save: blocked with the
   "Location Required" instructions dialog; nothing is saved.
5. **Poor accuracy** — set `NEXT_PUBLIC_GPS_ACCURACY_THRESHOLD_M=1` locally,
   Save: rejected with the best-accuracy hint.
6. **Duplicate protection** — save offline in two tabs, go online: exactly one
   `maintain` row per report; replays log `sync-replayed` events.
