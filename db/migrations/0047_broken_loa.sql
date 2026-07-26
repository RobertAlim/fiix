CREATE TABLE "maintenance_location" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"maintenanceId" integer NOT NULL,
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
	"capturedAt" timestamp with time zone NOT NULL,
	"gpsProvider" varchar(50) DEFAULT 'browser-geolocation',
	"isMockLocation" boolean DEFAULT false NOT NULL,
	"reverseGeocoded" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "maintenance_location_maintenanceId_unique" UNIQUE("maintenanceId")
);
--> statement-breakpoint
CREATE TABLE "maintenance_sync_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"clientUuid" uuid NOT NULL,
	"event" varchar(50) NOT NULL,
	"detail" text,
	"occurredAt" timestamp with time zone,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "maintain" ADD COLUMN "clientUuid" uuid;--> statement-breakpoint
ALTER TABLE "maintenance_location" ADD CONSTRAINT "maintenance_location_maintenanceId_maintain_id_fk" FOREIGN KEY ("maintenanceId") REFERENCES "public"."maintain"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintain" ADD CONSTRAINT "maintain_clientUuid_unique" UNIQUE("clientUuid");