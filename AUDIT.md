# Fiix — Production Readiness Audit

**Scope:** Full codebase review (architecture, security, database, performance, UI/UX, production readiness) of the Fiix printer maintenance tracker — Next.js 15.3 / React 19 / Clerk / Neon / Drizzle / R2.
**Approach:** Critical security issues were fixed immediately in this pass (Tier 1). Items requiring database migrations, flow changes, or product decisions are documented as recommendations (Tiers 2–3) so nothing risky was changed blind. The project builds cleanly with all Tier 1 fixes applied.

---

## ⚠️ Immediate action required (outside the code)

**Rotate your secrets.** The uploaded archive contained `.env.local` with live credentials: Clerk secret key, Clerk webhook signing secret, Neon `DATABASE_URL`, Semaphore API key, and R2 access keys. Any time a project archive containing real secrets leaves your machine, treat them as exposed. Rotate all five in their respective dashboards and update Vercel env vars. The file is correctly gitignored (verified: not in git history), but it travels with zips.

---

## Tier 1 — Critical issues (FIXED in this pass)

### 1. IDOR in `/api/user-status`
Any signed-in user could fetch **any other user's full database row** (contact number, birthday, email, role) by passing an arbitrary `?userId=`. The route now derives identity from the Clerk session and ignores client input entirely.

### 2. Arbitrary R2 writes via `/api/get-upload-url`
The client controlled `bucketName`, `key`, and `contentType` with no validation. Consequences: writes to any bucket the credentials can reach, path traversal in keys, overwriting existing objects (e.g., replacing another technician's signature image), and uploading arbitrary content types. The generated presigned URL — a temporary write credential — was also logged to the console. Fixed with a bucket allowlist (`fiixdrive`, `fiixnozzle`, default bucket), a content-type allowlist (png/jpeg/webp/pdf), key sanitization that strips traversal segments, presigned-URL expiry reduced from 1 hour to 10 minutes, an explicit auth check, and removal of the log line.

### 3. Unhardened direct upload at `/api/signupload`
No file-size limit, no content-type check, and the object key was the raw client filename — a trivial overwrite attack. Fixed: auth check, 5 MB cap, MIME allowlist, and UUID-prefixed sanitized keys.
**Note:** this route has *zero* callers in the codebase. It appears to be dead code — confirm and delete it in a follow-up.

### 4. Registration gate bypass in middleware
The inactive-user check only ran on `/` and `/dashboard`, so an unactivated account could navigate directly to `/scan-qrcode` or `/profile` and use the app. The gate now covers all app pages, with a 5-minute `httpOnly` cookie cache so active users don't trigger a status lookup on every navigation. (The proper long-term fix is Tier 2 item 2.)

### 5. OTP flow weaknesses
No phone-number validation, no resend cooldown (SMS-bombing / Semaphore credit-burning vector), expired codes lingered in the table, and `lib/otp.ts` contained a dead in-memory `Map` OTP store that could never work on serverless anyway. Fixed: Zod validation for PH mobile format (`09XXXXXXXXX` / `+639XXXXXXXXX`), 60-second resend cooldown, expired-code cleanup, single-use deletion, auth checks on both routes, and the dead module deleted.

### 6. Unvalidated profile writes
`/api/save-profile` wrote whatever JSON the client sent into the `users` table. Now Zod-validated (name length, birthday format, PH mobile format).

### 7. Missing security headers
Only a camera Permissions-Policy existed. Added HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, and tightened Permissions-Policy (microphone and geolocation denied).

### 8. No environment validation
Added `lib/env.ts` — a Zod-validated env module that fails fast at startup with a readable error listing exactly which variables are missing or malformed, instead of crashing mid-request. `lib/r2.ts` and the OTP route now consume it. Recommendation for later: rename the lowercase R2 vars (`accessKeyId`, `endpoint`, …) to conventional `R2_ACCESS_KEY_ID` etc. — kept as-is for now so nothing breaks on Vercel.

---

## Tier 2 — High priority (recommended next; needs migrations or flow changes)

### 1. No role-based access control anywhere
`users.role` exists but is never enforced. Every active user — technician or otherwise — can create/update schedules, write maintenance records, generate reports, and hit every API. Recommend a `requireRole()` helper applied per-route, with roles mirrored into Clerk `publicMetadata` at activation so checks don't need a DB round trip.

### 2. Middleware self-fetch anti-pattern
Middleware calls its own `/api/user-status` over HTTP — an extra network hop on the request path, and fragile (it silently fails open). The right architecture: when a user activates, write `isActive: true` (and `role`) into Clerk `publicMetadata` via the Backend SDK. Middleware then reads `sessionClaims` with **zero** fetches, and the cookie cache added in Tier 1 becomes unnecessary. This is a ~30-line change touching `verify-otp` (see item 4) and middleware.

### 3. Database schema: missing constraints and indexes
The schema has almost no foreign keys and no unique constraints. Concretely:

- `printers.serialNo`, `users.clerkId`, and `users.email` should be UNIQUE — duplicates here corrupt core flows (QR scan resolves by serialNo).
- The schedule insert uses `.onConflictDoNothing({ target: [technicianId, clientId, locationId, scheduledAt] })` — this **requires a unique index on those four columns in the database**. If it doesn't exist, that insert throws instead of returning the 409 duplicate path. Verify it exists in Neon; if not, this code path is broken today.
- No FKs on `locations.clientId`, any `maintain.*Id`, `schedules.*Id`, `scheduleDetails.*`, or `deployments.*` — this is exactly how the orphaned-maintenance-records incident (empty `deployments` table) was able to happen silently. FKs with `RESTRICT` on delete would have refused the destructive operation.
- No indexes on join columns (`deployments.printerId`, `maintain.deploymentId`, `scheduleDetails.scheduleId`, …). Fine at current volume; not at "thousands of users."

Suggested migration (review before running — FK creation will fail if orphans still exist, which is itself useful validation):

```sql
CREATE UNIQUE INDEX IF NOT EXISTS printers_serial_no_uq ON printers ("serialNo");
CREATE UNIQUE INDEX IF NOT EXISTS users_clerk_id_uq ON users ("clerkId");
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users (email);
CREATE UNIQUE INDEX IF NOT EXISTS schedules_dedupe_uq
  ON schedules ("technicianId", "clientId", "locationId", "scheduledAt");
CREATE INDEX IF NOT EXISTS deployments_printer_idx ON deployments ("printerId");
CREATE INDEX IF NOT EXISTS maintain_deployment_idx ON maintain ("deploymentId");
CREATE INDEX IF NOT EXISTS sched_details_schedule_idx ON "scheduleDetails" ("scheduleId");
ALTER TABLE locations ADD CONSTRAINT locations_client_fk
  FOREIGN KEY ("clientId") REFERENCES clients(id);
ALTER TABLE deployments ADD CONSTRAINT deployments_printer_fk
  FOREIGN KEY ("printerId") REFERENCES printers(id);
ALTER TABLE "scheduleDetails" ADD CONSTRAINT sched_details_schedule_fk
  FOREIGN KEY ("scheduleId") REFERENCES schedules(id) ON DELETE CASCADE;
-- (add remaining FKs for maintain/schedules once orphans are resolved)
```

### 4. Activation should happen server-side
Today the *client* sends `isActive: true` to `/api/save-profile` after the OTP screen — the server never verifies that OTP verification actually happened. Anyone with a session can POST `{"isActive": true}` and skip verification. Recommend: `/api/verify-otp` itself sets `isActive = true` (and Clerk metadata, per item 2) on success, and `save-profile` stops accepting `isActive` at all.

### 5. No transactions on multi-step writes
`POST /api/schedule` inserts the schedule, then inserts details, then updates — in separate statements. A failure midway leaves orphaned rows (a failure mode this project has already experienced once). The `neon-http` driver doesn't support transactions; switch `db/index.ts` to `drizzle-orm/neon-serverless` (WebSocket driver with `Pool`) to unlock `db.transaction()`, then wrap the schedule and maintain write flows. Small change, big integrity win.

### 6. Relations in `db/schema.ts` are wrong
`printersRelations` is actually defined on `deployments`; `maintainRelations.printer` maps `maintain.deploymentId → printers.id` (a deployment id compared against a printer id); `maintainRelations.signatory` references `users` instead of `signatories`; `deploymentRelations` duplicates. The raw-SQL-style queries dodge these bugs, but any use of the `db.query.*` relational API will return silently wrong joins. These should be corrected together with the FK migration.

### 7. No pagination
`maintenance-history`, printer lists, and schedules return unbounded result sets. Add `limit/offset` (or cursor) pagination server-side and wire it into the TanStack Table instances, which already support it.

---

## Tier 3 — Architecture, quality, and UX (roadmap)

**God components.** `Schedule.tsx` (1,616 lines) and `Maintenance.tsx` (1,396 lines) each mix data fetching, form state, upload orchestration, dialog management, and rendering. Recommend a feature-folder split (`features/schedule/{components,hooks,api}.ts`), with fetch logic moved into TanStack Query hooks (the project already uses it elsewhere — `use-schedules.ts` is the right pattern) and uploads extracted into a shared `useR2Upload` hook, since Dashboard and Maintenance duplicate the presign-then-PUT sequence today.

**API layer consistency.** 26 flat route files repeat the same boilerplate (parse → validate → query → error). A small `lib/api.ts` with a `withHandler({ schema, roles }, fn)` wrapper would give every route auth, Zod validation, a standard error envelope, and centralized logging in one place. Alternatively, migrate the write paths to Server Actions and keep routes only for things that must be routes (webhooks, PDF, uploads). Also normalize the response-shape oddities: `printers` returns a bare `{status: 200}` object when params are zero, and `maintain` returns HTTP 404 with the message "Duplicate" where 409 is the correct status.

**Logging.** 59 `console.*` calls across the app. Replace with a leveled logger (pino) so production logs are structured and debug noise is compile-time gated; several current logs print full response objects.

**State management.** `userStore` (Zustand) initializes with `{} as User` and is effectively superseded by the `useDBUser` query hook. Remove it, and audit other client state for things that are really server state.

**Dead weight.** `/api/signupload` (unused), `/api/ph-time` (an HTTP round trip to compute local time — `date-fns-tz` does this in-process; the dependency is already installed), commented-out code blocks in schema and routes.

**TypeScript strictness.** Non-null assertions on DB results (`updatedSchedule.id` after an `UPDATE` that may match zero rows will crash at runtime) — return 404 on empty `.returning()` instead.

**Performance.** `@react-pdf/renderer` in `/api/pdf` is heavy — confirm it's not pulled into any client bundle and consider deferring report generation. Parallelize the sequential fetches in `maintain` GET (`Promise.all`). Add `React.memo`/`useMemo` only after the god-component split, where re-render boundaries become real.

**UI/UX modernization.** The shadcn/Radix base and the Mapify-aligned theme are solid foundations. Highest-value polish for a technician-facing tool: skeleton states on the dashboard and tables (skeleton component exists but is underused), empty states with a call to action, optimistic updates on the task tracker toggles, larger touch targets on the QR/scan flow, and consistent toast usage (sonner is installed; some flows still fail silently to the console). A full visual redesign wasn't attempted — it needs your product input on which screens technicians live in.

**Production readiness gaps.** Rate limiting (Vercel WAF rules or `@upstash/ratelimit` on the OTP and upload routes), a `/api/health` endpoint, error monitoring (Sentry has first-class Next.js support), and an `audit_log` table for schedule/maintenance mutations (who changed what, when — valuable for a multi-technician operation).

---

## Suggested sequence

1. Rotate secrets (today).
2. Deploy Tier 1 (this zip) after a smoke test of: sign-in → registration → OTP → dashboard → schedule create → maintenance record with photo upload.
3. Run the Tier 2 migration in Neon (staging branch first — Neon branching makes this cheap), fix schema relations, switch to the transactional driver.
4. Move activation server-side + Clerk metadata (kills the middleware fetch).
5. RBAC helper across routes.
6. Component decomposition and API consolidation, incrementally, one feature at a time.
