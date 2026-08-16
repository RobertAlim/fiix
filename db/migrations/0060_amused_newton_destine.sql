CREATE TABLE "maintenanceResolutions" (
	"id" serial PRIMARY KEY NOT NULL,
	"maintainId" integer NOT NULL,
	"resolvedByUserId" integer NOT NULL,
	"resolvedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text NOT NULL,
	CONSTRAINT "maintenanceResolutions_maintainId_unique" UNIQUE("maintainId")
);
--> statement-breakpoint
CREATE TABLE "staffGpsLocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"label" varchar(60) DEFAULT 'Office' NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"radiusMeters" integer DEFAULT 150 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "staffGpsLocations_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "technicianGpsPings" (
	"id" serial PRIMARY KEY NOT NULL,
	"technicianId" integer NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"accuracy" double precision,
	"capturedAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "maintain" ALTER COLUMN "signPath" SET DEFAULT 'Unsigned';--> statement-breakpoint
ALTER TABLE "maintain" ALTER COLUMN "signPath" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "signatories" ADD COLUMN "locationId" integer;--> statement-breakpoint
ALTER TABLE "maintenanceResolutions" ADD CONSTRAINT "maintenanceResolutions_maintainId_maintain_id_fk" FOREIGN KEY ("maintainId") REFERENCES "public"."maintain"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenanceResolutions" ADD CONSTRAINT "maintenanceResolutions_resolvedByUserId_users_id_fk" FOREIGN KEY ("resolvedByUserId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staffGpsLocations" ADD CONSTRAINT "staffGpsLocations_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technicianGpsPings" ADD CONSTRAINT "technicianGpsPings_technicianId_users_id_fk" FOREIGN KEY ("technicianId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "technicianGpsPings_technicianId_capturedAt_idx" ON "technicianGpsPings" USING btree ("technicianId","capturedAt");