-- Offline-first maintenance reports with mandatory GPS
-- 1. Idempotency key for offline sync retries
ALTER TABLE "maintain" ADD COLUMN IF NOT EXISTS "clientUuid" uuid;
CREATE UNIQUE INDEX IF NOT EXISTS "maintain_client_uuid_uq" ON "maintain" ("clientUuid");

-- 2. Normalized GPS record per maintenance report
CREATE TABLE IF NOT EXISTS "maintenance_location" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"maintenanceId" integer NOT NULL UNIQUE REFERENCES "maintain"("id") ON DELETE CASCADE,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"accuracy" real NOT NULL,
	"altitude" double precision,
	"heading" real,
	"speed" real,
	"locationName" text,
	"formattedAddress" text,
	"city" varchar(100),
	"province" varchar(100),
	"country" varchar(100),
	"postalCode" varchar(20),
	"capturedAt" timestamptz NOT NULL,
	"gpsProvider" varchar(50) DEFAULT 'browser-geolocation',
	"isMockLocation" boolean NOT NULL DEFAULT false,
	"reverseGeocoded" boolean NOT NULL DEFAULT false,
	"createdAt" timestamp NOT NULL DEFAULT now(),
	"updatedAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "maintenance_location_mt_idx" ON "maintenance_location" ("maintenanceId");

-- 3. Server-side sync audit trail
CREATE TABLE IF NOT EXISTS "maintenance_sync_events" (
	"id" serial PRIMARY KEY,
	"clientUuid" uuid NOT NULL,
	"event" varchar(50) NOT NULL,
	"detail" text,
	"occurredAt" timestamptz,
	"createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "maintenance_sync_events_uuid_idx" ON "maintenance_sync_events" ("clientUuid");
