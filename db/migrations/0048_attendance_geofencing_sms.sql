CREATE TABLE "locationGeofences" (
	"id" serial PRIMARY KEY NOT NULL,
	"locationId" integer NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"radiusMeters" integer DEFAULT 150 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "locationGeofences_locationId_unique" UNIQUE("locationId")
);
--> statement-breakpoint
CREATE TABLE "smsRecipients" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" varchar(100) NOT NULL,
	"mobileNumber" varchar(13) NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "smsRecipients_mobileNumber_unique" UNIQUE("mobileNumber")
);
--> statement-breakpoint
CREATE TABLE "technicianAttendance" (
	"id" serial PRIMARY KEY NOT NULL,
	"technicianId" integer NOT NULL,
	"workDate" date NOT NULL,
	"timeIn" timestamp with time zone NOT NULL,
	"timeInLatitude" double precision NOT NULL,
	"timeInLongitude" double precision NOT NULL,
	"firstScheduleId" integer,
	"timeOut" timestamp with time zone,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "sequence" integer;--> statement-breakpoint
ALTER TABLE "locationGeofences" ADD CONSTRAINT "locationGeofences_locationId_locations_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technicianAttendance" ADD CONSTRAINT "technicianAttendance_technicianId_users_id_fk" FOREIGN KEY ("technicianId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technicianAttendance" ADD CONSTRAINT "technicianAttendance_firstScheduleId_schedules_id_fk" FOREIGN KEY ("firstScheduleId") REFERENCES "public"."schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "technicianAttendance_technician_workDate_idx" ON "technicianAttendance" USING btree ("technicianId","workDate");