import { InferInsertModel, sql } from "drizzle-orm";
import {
	timestamp,
	uuid,
	doublePrecision,
	real,
	pgTable,
	pgView,
	uniqueIndex,
	index,
	serial,
	text,
	date,
	integer,
	boolean,
	varchar,
	AnyPgColumn,
} from "drizzle-orm/pg-core";
import { InferSelectModel, relations } from "drizzle-orm";

//RELATIONAL TABLES****************************************************************************************

/** Proximity cluster of nearby clients — the gray group-separator rows in
 * the Monitoring report (components/pages/Monitoring.tsx). Manually
 * assigned (not computed from coordinates): a Scheduler creates a group
 * for a neighborhood/building complex and adds the clients that belong to
 * it, and can re-assign clients between groups any time locations change
 * — see db/migrations/0062. */
export const clientGroups = pgTable("clientGroups", {
	id: serial("id").primaryKey(),
	name: varchar("name", { length: 100 }).notNull(),
	/** "South" | "North" — same two values as clients.area below. Carried
	 * on the group itself (not just inferred from its members) so the
	 * Monitoring report can place a group's separator row under the right
	 * section header without depending on every member client agreeing. */
	area: varchar("area", { length: 10 }).notNull(),
	createdAt: timestamp("createdAt")
		.notNull()
		.default(sql`now()`),
});

export const clients = pgTable("clients", {
	id: serial("id").primaryKey(),
	name: varchar("name", { length: 100 }).notNull(),
	/** "South" | "North" — which half of the Monitoring report this
	 * client's rows appear under (db/migrations/0062). Nullable: an
	 * unclassified client is unaffected everywhere else in the app, it
	 * just doesn't show in either Monitoring section until this is set. */
	area: varchar("area", { length: 10 }),
	/** Proximity cluster this client belongs to, for the Monitoring
	 * report's gray group-separator rows. Nullable: an ungrouped client
	 * still shows under its Area, just with no group separator around it. */
	clientGroupId: integer("clientGroupId").references(() => clientGroups.id),
});

export const locations = pgTable("locations", {
	id: serial("id").primaryKey(),
	clientId: integer("clientId").notNull(),
	name: varchar("name", { length: 50 }).notNull(),
});

export const departments = pgTable("departments", {
	id: serial("id").primaryKey(),
	name: varchar("name", { length: 50 }).notNull(),
});

export const models = pgTable("models", {
	id: serial("id").primaryKey(),
	name: varchar("name", { length: 20 }).notNull(),
});

export const parts = pgTable("parts", {
	id: serial("id").primaryKey(),
	name: varchar("name", { length: 50 }).notNull(),
});

// Uncomment if you need a job table. In the future, you might want to dynamically link jobs to maintenance records.
// export const job = pgTable("job", {
// 	id: serial("id").primaryKey(),
// 	name: varchar("name", { length: 50 }).notNull(),
// 	subName: varchar("subname", { length: 100 }),
// });

export const priorities = pgTable("priorities", {
	id: integer("id").primaryKey().notNull(),
	name: varchar("name", { length: 6 }).notNull(),
});

export const status = pgTable("status", {
	id: serial("id").primaryKey(),
	name: varchar("name", { length: 50 }).notNull(),
});

//TRANSACTIONAL TABLES****************************************************************************************
export const users = pgTable("users", {
	id: serial("id").primaryKey(),
	firstName: varchar("firstName", { length: 20 }).notNull(),
	lastName: varchar("lastName", { length: 20 }).notNull(),
	middleName: varchar("middleName", { length: 20 }),
	contactNo: varchar("contactNo", { length: 11 }),
	birthday: date("birthday"),
	email: varchar("email", { length: 50 }).notNull().unique(),
	role: varchar("role", { length: 15 }),
	isActive: boolean("isActive").default(false),
	clerkId: text("clerkId").notNull(),
	createdAt: timestamp("createdAt")
		.notNull()
		.default(sql`now()`),
});

export const maintain = pgTable("maintain", {
	id: serial("id").primaryKey(),
	deploymentId: integer("deploymentId").notNull(),
	clientId: integer("clientId").notNull(),
	locationId: integer("locationId"),
	departmentId: integer("departmentId"),
	replaceUnit: boolean("replaceUnit").default(false),
	replaceSerialNo: varchar("replaceSerialNo", { length: 50 }), //serialNo of the replaced printer unit
	headClean: boolean("headClean").default(false),
	inkFlush: boolean("inkFlush").default(false),
	statusId: integer("statusId").notNull(),
	cleanPrinter: boolean("cleanPrinter").default(false),
	cleanWasteTank: boolean("cleanWasteTank").default(false),
	notes: text("notes"),
	userId: integer("userId").notNull(),
	signatoryId: integer("signatoryId").notNull(),
	// NOT NULL + a real default in the actual production database (confirmed
	// via a live Postgres constraint-violation error — code 23502, "null
	// value in column signPath ... violates not-null constraint" — this
	// schema.ts file previously declared it as plain nullable with no
	// default, which didn't match reality). "Unsigned" is the app's
	// established sentinel for "no signature captured yet" — checked in at
	// least eight places across the app (PDF report rendering, dashboards,
	// the purge tool, features/offline-sync/save-maintenance-report.ts's
	// own `signKey ?? "Unsigned"`) — so every INSERT path needs a real,
	// non-null value here regardless of client. The DB-level default below
	// is defense-in-depth on top of that convention: any future client
	// that forgets to send signPath explicitly gets the correct sentinel
	// automatically instead of a 500.
	signPath: text("signPath").notNull().default("Unsigned"),
	nozzlePath: text("nozzlePath"),
	createdAt: timestamp("createdAt")
		.notNull()
		.default(sql`now()`),
	originMTId: integer("originMTId").references((): AnyPgColumn => maintain.id), // Self-referencing foreign key
	// Client-generated UUID for offline-first sync. A retried sync of the same
	// locally-saved report carries the same clientUuid, so the server can
	// detect the replay and return the existing record instead of inserting a
	// duplicate. Nullable because legacy rows predate offline support.
	clientUuid: uuid("clientUuid").unique(),
	/** True only for records created via the Admin-only Purge Maintenance
	 * backfill tool, as opposed to a Technician's normal field workflow. No
	 * maintenanceLocation row is ever created for these (there was no GPS
	 * fix to capture), which is what the report print layout already keys
	 * off of to omit "GPS Verified Location" — this column exists mainly so
	 * the backfill's progress/completeness can be audited directly
	 * (`SELECT count(*) FROM maintain WHERE "isBackfilled"`), independent of
	 * that join. Purge Maintenance is a temporary migration tool; once
	 * historical data is fully synchronized this column (and the module)
	 * can be removed. */
	isBackfilled: boolean("isBackfilled").notNull().default(false),
	// "Previous/latest recorded value" is this column's most recent
	// non-null value for the printer, which app/api/maintain's GET handler
	// resolves and returns as `lastPrintCount`, and the POST handler
	// re-checks server-side before insert (see the printCount validation
	// blocks in both). Also surfaced as the printer's current Print Count
	// in the Printers grid's history modal (app/api/printers/[id]/history).
	printCount: integer("printCount"),
});

export const schedules = pgTable("schedules", {
	id: serial("id").primaryKey(),
	technicianId: integer("technicianId").notNull(),
	clientId: integer("clientId").notNull(),
	locationId: integer("locationId").notNull(),
	priority: integer("priority").notNull().default(0),
	notes: text("notes"),
	maintainAll: boolean("maintainAll").default(false),
	scheduledAt: date("scheduledAt").notNull(),
	/** Visit order within one technician's day, set by the Scheduler.
	 * Nullable so existing rows (and schedules created before this feature)
	 * don't need a backfill — a null sorts after any assigned sequence. */
	sequence: integer("sequence"),
	/** The schedule this one was created to replace, when it came from the
	 * Reschedule action on a missed visit. Null for every normally-created
	 * schedule.
	 *
	 * Rescheduling deliberately does NOT edit the original row: "missed" is
	 * derived (scheduledAt in the past with work still unmaintained — see
	 * app/api/missed-schedules), so mutating the original would erase the
	 * fact that the visit was ever missed. A new row plus this back-pointer
	 * keeps the original intact and makes the full chain walkable — a visit
	 * rescheduled twice is A <- B <- C, and following the pointers back
	 * yields the complete audit trail. */
	rescheduledFromId: integer("rescheduledFromId").references(
		(): AnyPgColumn => schedules.id
	),
	createdAt: timestamp("createdAt")
		.notNull()
		.default(sql`now()`),
});

export const scheduleDetails = pgTable(
	"scheduleDetails",
	{
		id: serial("id").primaryKey(),
		scheduleId: integer("scheduleId").notNull(),
		printerId: integer("printerId").notNull(),
		originMTId: integer("mtId"),
		isMaintained: boolean("isMaintained").notNull().default(false),
		maintainedDate: timestamp("maintainedDate"),
	},
	(table) => ({
		// A printer appears on a given schedule at most once. Enforced here
		// (not just checked in application code) after production data
		// turned up several schedules where every printer had been
		// duplicated — traced to the create/edit schedule routes' insert
		// having no protection against being submitted twice for the same
		// schedule in quick succession (a select-then-insert check has a
		// race window; this closes it at the database layer instead). See
		// migration 0061 and the onConflictDoNothing() calls in
		// app/api/schedule/route.ts.
		scheduleDetailsSchedulePrinterUnique: uniqueIndex(
			"scheduleDetails_scheduleId_printerId_unique"
		).on(table.scheduleId, table.printerId),
	})
);

export const colors = pgTable("colors", {
	id: serial("id").primaryKey(),
	mtId: integer("mtId").notNull(),
	cyan: boolean("cyan"),
	magenta: boolean("magenta"),
	yellow: boolean("yellow"),
	black: boolean("black"),
});

export const resets = pgTable("resets", {
	id: serial("id").primaryKey(),
	mtId: integer("mtId").notNull(),
	box: boolean("box"),
	program: boolean("program"),
});

export const replace = pgTable("replace", {
	id: serial("id").primaryKey(),
	mtId: integer("mtId").notNull(),
	partId: integer("partId").notNull(),
});

export const repair = pgTable("repair", {
	id: serial("id").primaryKey(),
	mtId: integer("mtId").notNull(),
	partId: integer("partId").notNull(),
});

export const printers = pgTable("printers", {
	id: serial("id").primaryKey(),
	serialNo: varchar("serialNo", { length: 50 }).notNull(),
	deployedClient: integer("clientId").notNull(),
	/**
	 * "Active" | "Inactive" | "Missing". A plain string rather than a
	 * foreign key into `status` (which enumerates MAINTENANCE report
	 * statuses, e.g. "Pulled Out") — this is a different, narrower concept
	 * entirely: the printer's own deployment state. "Missing" is also set
	 * from the Missing/Found actions in the Transfer Printer dialog
	 * (components/PrinterTransferDialog.tsx) — "not physically found at its
	 * recorded location, but still exists in the system" — and a normal
	 * transfer (the printer was found and moved) always clears it back to
	 * "Active". "Active" / "Inactive" are otherwise editable directly from
	 * the Edit Printer form's Status selector.
	 */
	status: varchar("status", { length: 20 }).notNull().default("Active"),
	createdAt: timestamp("createdAt")
		.notNull()
		.default(sql`now()`),
});

export const deployments = pgTable("deployments", {
	id: serial("id").primaryKey(),
	printerId: integer("printerId").notNull(),
	modelId: integer("modelId").notNull(),
	clientId: integer("clientId").notNull(),
	locationId: integer("locationId").notNull(),
	departmentId: integer("departmentId").notNull(),
	deploymentDate: date("deploymentDate").notNull(),
	deployedHere: boolean("deployedHere").notNull(),
	createdAt: timestamp("createdAt")
		.notNull()
		.default(sql`now()`),
});

// Define the View in TypeScript
export const activeDeployment = pgView("active_deployment", {
	// Define the columns the view will return
	id: serial("id").primaryKey(),
	printerId: integer("printerId").notNull(),
	modelId: integer("modelId").notNull(),
	clientId: integer("clientId").notNull(),
	locationId: integer("locationId").notNull(),
	departmentId: integer("departmentId").notNull(),
	deploymentDate: date("deploymentDate").notNull(),
	deployedHere: boolean("deployedHere").notNull(),
	createdAt: timestamp("createdAt")
		.notNull()
		.default(sql`now()`),
}).as(
	// Use sql template tag to define the view's query
	sql`
    SELECT
        *
    FROM
        ${deployments}
    WHERE
        ${deployments.deployedHere} = True
  `
);

export const signatories = pgTable("signatories", {
	id: serial("id").primaryKey(),
	firstName: varchar("firstName", { length: 20 }).notNull(),
	lastName: varchar("lastName", { length: 20 }).notNull(),
	clientId: integer("clientId"),
	/** Nullable, same reasoning as clientId above — an existing client-only
	 * signatory (created before this column existed) has no location on
	 * file and stays valid rather than becoming orphaned data. New
	 * signatories added from the mobile app's Maintenance form always set
	 * this, since a technician always has a specific location in hand when
	 * adding one. */
	locationId: integer("locationId"),
});

export const otps = pgTable("otps", {
	id: serial("id").primaryKey(),
	phone: varchar("phone", { length: 15 }).notNull(),
	code: varchar("code", { length: 6 }).notNull(),
	expiresAt: timestamp("expires_at").notNull(),
});

/** Selectable Support Service categories (2307 BIR Form, Collection,
 * Billing, Contracts, Others, ...) — an Admin-editable list rather than a
 * hardcoded enum, same reasoning as `status`/`priorities` elsewhere in
 * this schema. Seeded with the initial set in migration 0063; `isActive`
 * lets one be retired without deleting history that references it. */
export const supportServiceType = pgTable("supportServiceType", {
	id: serial("id").primaryKey(),
	name: text("name").notNull(),
	isActive: boolean("isActive").notNull().default(true),
	createdAt: timestamp("createdAt").notNull().default(sql`now()`),
});

/**
 * A technician's non-maintenance scheduled work — client visits with no
 * printer attached (BIR forms, collection, billing, contracts). One row
 * serves as both the SCHEDULED assignment (created by a Scheduler, mirrors
 * what a `schedules` row is for printer visits) and its own COMPLETION
 * record (filled in by the technician) — there is no separate "log" table,
 * matching how `scheduleDetails.isMaintained` plays the same dual role for
 * a printer stop.
 *
 * Deliberately uses plain `integer(...).notNull()` for clientId/locationId/
 * technicianId/supportServiceTypeId/signatoryId rather than `.references()`
 * — matching `schedules`' own established convention in this same file
 * (see schedules.clientId/locationId/technicianId above, none of which
 * have a DB-level FK either). Referential integrity for this table is
 * enforced the same way it already is for schedules: in application code,
 * not the database.
 */
export const supportServices = pgTable("supportServices", {
	id: serial("id").primaryKey(),
	clientId: integer("clientId").notNull(),
	locationId: integer("locationId").notNull(),
	supportServiceTypeId: integer("supportServiceTypeId").notNull(),
	technicianId: integer("technicianId").notNull(),
	scheduledAt: date("scheduledAt").notNull(),
	/** Non-null when this row originated from a `schedules` entry that had
	 * NO printer attached — the "a Schedule has been set for a client but
	 * no printer itinerary selected" case from the original request,
	 * which is meant to be documentable through this exact workflow, not
	 * just displayed read-only. Null for a row a Scheduler creates
	 * directly as a dedicated Support Service (once that UI exists).
	 * Purely a traceability link back to the originating schedule — this
	 * table remains the single record of what was actually done, per the
	 * original design (a different module, a different table). */
	scheduleId: integer("scheduleId"),
	/** Visit order within the technician's day — same purpose and same
	 * nullable-until-sequenced convention as `schedules.sequence`. Needed
	 * so a day mixing printer stops and support errands can eventually be
	 * ordered as ONE itinerary (see the `lastStop`/`lastGeofence` logic in
	 * app/api/attendance/status/route.ts, which currently falls back to
	 * "whichever source has entries" when this is still unset — see that
	 * route's own comment for the gap this closes once a Scheduler UI
	 * actually sets it). */
	sequence: integer("sequence"),
	/** Written by the Scheduler when assigning the activity — read-only to
	 * the technician, mirrors `schedules.notes`. */
	notes: text("notes"),
	/** null while still outstanding. Set by the technician on completion —
	 * same role `scheduleDetails.isMaintained` plays, just a two-value
	 * outcome instead of a boolean since "couldn't be achieved" is a
	 * meaningful, expected result here (e.g. nobody available to sign),
	 * not a failure to record. */
	status: varchar("status", { length: 20 }),
	technicianNotes: text("technicianNotes"),
	signatoryId: integer("signatoryId"),
	photoUrl: text("photoUrl"),
	/** Same "Unsigned" sentinel convention as maintain.signPath — see that
	 * column's doc comment. Kept nullable here rather than NOT NULL with a
	 * default: unlike a maintenance report, a "Not Achieved" support
	 * activity legitimately has no signature at all (nobody to sign for
	 * an errand that couldn't be completed), and forcing a sentinel value
	 * onto that case would misrepresent it as "signature not yet
	 * captured" rather than "not applicable." */
	signatureUrl: text("signatureUrl"),
	/** GPS fix captured at completion. Inline columns rather than a
	 * separate join table (unlike maintain's `maintenanceLocation`) —
	 * this workflow has no reverse-geocoding step, so there's nothing a
	 * second table would need to hold beyond what fits here. */
	gpsLatitude: doublePrecision("gpsLatitude"),
	gpsLongitude: doublePrecision("gpsLongitude"),
	gpsAccuracy: doublePrecision("gpsAccuracy"),
	gpsCapturedAt: timestamp("gpsCapturedAt"),
	/** Client-generated UUID for offline-first sync idempotency — same
	 * purpose and same pattern as maintain.clientUuid. */
	clientUuid: uuid("clientUuid").unique(),
	completedAt: timestamp("completedAt"),
	createdAt: timestamp("createdAt").notNull().default(sql`now()`),
	updatedAt: timestamp("updatedAt").notNull().default(sql`now()`),
});

// Define relations for Drizzle ORM
// --- RELATIONS ---

// Schedule relations (as before)
export const schedulesRelations = relations(schedules, ({ one, many }) => ({
	scheduleDetails: many(scheduleDetails),
	technician: one(users, {
		fields: [schedules.technicianId],
		references: [users.id],
	}),
	client: one(clients, {
		fields: [schedules.clientId],
		references: [clients.id],
	}),
	location: one(locations, {
		fields: [schedules.locationId],
		references: [locations.id],
	}),
	priorityLevel: one(priorities, {
		fields: [schedules.priority],
		references: [priorities.id],
	}),
}));

// ScheduleDetails relations (add printer relation)
export const scheduleDetailsRelations = relations(
	scheduleDetails,
	({ one, many }) => ({
		schedule: one(schedules, {
			fields: [scheduleDetails.scheduleId],
			references: [schedules.id],
		}),
		printer: one(printers, {
			fields: [scheduleDetails.printerId],
			references: [printers.id],
		}),
		// ** BAGONG RELATION: Para sa isang espisipikong Maintenance Record **
		// Ito ay magli-link sa isang maintenanceRecord kung saan ang maintenanceRecord.id ay katumbas ng scheduleDetails.originMTId
		maintainRecord: one(maintain, {
			fields: [scheduleDetails.originMTId], // Ito ang field sa scheduleDetails
			references: [maintain.id], // Ito ang field sa maintenanceRecords na irereference
		}),
	})
);

// Printers relations (add models, departments, and maintain relations)
export const printersRelations = relations(deployments, ({ one, many }) => ({
	model: one(models, {
		// Relation to models
		fields: [deployments.modelId],
		references: [models.id],
	}),
	department: one(departments, {
		// Relation to departments
		fields: [deployments.departmentId],
		references: [departments.id],
	}),
	// A printer can have MANY maintenance records
	maintenanceRecords: many(maintain), // Using 'maintenanceRecords' for the many relation
	// Also relate back to client and location if needed for printer's own data
	client: one(clients, {
		fields: [deployments.clientId],
		references: [clients.id],
	}),
	location: one(locations, {
		fields: [deployments.locationId],
		references: [locations.id],
	}),
	deploymentRecords: many(deployments),
}));

// Maintain relations (add printer and status relations)
export const maintainRelations = relations(maintain, ({ one }) => ({
	printer: one(printers, {
		// Relation back to printer
		fields: [maintain.deploymentId],
		references: [printers.id],
	}),
	status: one(status, {
		// Relation to status
		fields: [maintain.statusId],
		references: [status.id],
	}),
	// Relate to user and signatory if you want those details
	user: one(users, { fields: [maintain.userId], references: [users.id] }),
	signatory: one(users, {
		fields: [maintain.signatoryId],
		references: [users.id],
	}),
}));

// Optional: relations for other tables
export const modelsRelations = relations(models, ({ many }) => ({
	printers: many(printers),
}));

export const departmentsRelations = relations(departments, ({ many }) => ({
	printers: many(printers),
}));

export const statusRelations = relations(status, ({ many }) => ({
	maintainRecords: many(maintain),
}));

export const deploymentRelations = relations(deployments, ({ many }) => ({
	printerRecords: many(printers),
}));

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
// You can also infer the type for type-safe usage in Next.js components/APIs
export type ActiveDeploymentView = typeof activeDeployment.$inferSelect;

//OFFLINE-FIRST GPS SUPPORT****************************************************************************

/**
 * Normalized GPS record for a maintenance report. Kept in its own table (not
 * mixed into `maintain`) for cleaner reporting, future GPS history, and reuse
 * by other modules. One row per maintenance report today (unique FK), but the
 * shape allows relaxing to one-to-many later.
 */
export const maintenanceLocation = pgTable("maintenance_location", {
	id: uuid("id").primaryKey().defaultRandom(),
	maintenanceId: integer("maintenanceId")
		.notNull()
		.unique()
		.references(() => maintain.id, { onDelete: "cascade" }),
	latitude: doublePrecision("latitude").notNull(),
	longitude: doublePrecision("longitude").notNull(),
	/** Horizontal accuracy in meters, as reported by the Geolocation API. */
	accuracy: real("accuracy").notNull(),
	altitude: doublePrecision("altitude"),
	heading: real("heading"),
	speed: real("speed"),
	/** Short human-readable name, e.g. "Camella Del Rio Talon Dos Las Piñas City". */
	locationName: text("locationName"),
	formattedAddress: text("formattedAddress"),
	city: varchar("city", { length: 100 }),
	province: varchar("province", { length: 100 }),
	country: varchar("country", { length: 100 }),
	postalCode: varchar("postalCode", { length: 20 }),
	/** Device timestamp at which the fix was acquired (may predate sync). */
	capturedAt: timestamp("capturedAt", { withTimezone: true }).notNull(),
	gpsProvider: varchar("gpsProvider", { length: 50 }).default("browser-geolocation"),
	isMockLocation: boolean("isMockLocation").notNull().default(false),
	/** False until a reverse-geocode has populated the address fields. */
	reverseGeocoded: boolean("reverseGeocoded").notNull().default(false),
	createdAt: timestamp("createdAt").notNull().default(sql`now()`),
	updatedAt: timestamp("updatedAt").notNull().default(sql`now()`),
});

export const maintenanceLocationRelations = relations(
	maintenanceLocation,
	({ one }) => ({
		maintenance: one(maintain, {
			fields: [maintenanceLocation.maintenanceId],
			references: [maintain.id],
		}),
	})
);

/**
 * Server-side audit trail of offline synchronization events, keyed by the
 * client-generated report UUID so events created before the `maintain` row
 * exists can still be linked afterwards.
 */
export const maintenanceSyncEvents = pgTable("maintenance_sync_events", {
	id: serial("id").primaryKey(),
	clientUuid: uuid("clientUuid").notNull(),
	event: varchar("event", { length: 50 }).notNull(),
	detail: text("detail"),
	/** When the event happened on the device (client clock). */
	occurredAt: timestamp("occurredAt", { withTimezone: true }),
	createdAt: timestamp("createdAt").notNull().default(sql`now()`),
});

export type MaintenanceLocation = InferSelectModel<typeof maintenanceLocation>;
export type NewMaintenanceLocation = InferInsertModel<typeof maintenanceLocation>;

// ATTENDANCE / GEOFENCING / SMS ***********************************************************************

/**
 * Per-location geofence configuration used to gate a technician's Time In.
 * One row per `locations` entry — a client with several branches configures
 * each branch separately, since "close enough" is meaningless without
 * knowing which branch is first on the itinerary that day.
 */
export const locationGeofences = pgTable("locationGeofences", {
	id: serial("id").primaryKey(),
	locationId: integer("locationId")
		.notNull()
		.unique()
		.references(() => locations.id, { onDelete: "cascade" }),
	latitude: doublePrecision("latitude").notNull(),
	longitude: doublePrecision("longitude").notNull(),
	/** Allowed distance from the pin, in meters. */
	radiusMeters: integer("radiusMeters").notNull().default(150),
	createdAt: timestamp("createdAt").notNull().default(sql`now()`),
	updatedAt: timestamp("updatedAt").notNull().default(sql`now()`),
});

/**
 * A technician's single workday attendance record: one row per
 * (technician, work date), created on Time In and closed on Time Out.
 * The unique constraint is what makes "already timed in today" a database
 * fact rather than something the client has to infer.
 */
export const technicianAttendance = pgTable(
	"technicianAttendance",
	{
		id: serial("id").primaryKey(),
		technicianId: integer("technicianId")
			.notNull()
			.references(() => users.id),
		/** Calendar date in Asia/Manila the shift belongs to — not the raw
		 * timestamp, since a shift starting at 11:58 PM shouldn't file under
		 * the next day. */
		workDate: date("workDate").notNull(),
		timeIn: timestamp("timeIn", { withTimezone: true }).notNull(),
		timeInLatitude: doublePrecision("timeInLatitude").notNull(),
		timeInLongitude: doublePrecision("timeInLongitude").notNull(),
		/** The schedule the geofence check was validated against, for audit. */
		firstScheduleId: integer("firstScheduleId").references(
			(): AnyPgColumn => schedules.id
		),
		timeOut: timestamp("timeOut", { withTimezone: true }),
		/** Set the moment the Time In SMS batch is claimed for sending — not
		 * just after it succeeds. Acts as a single-flight lock: whichever
		 * request wins this compare-and-set is the only one that ever calls
		 * Semaphore for this session, even if the route were somehow invoked
		 * more than once for the same successful Time In (a client retry
		 * after a lost response, for instance). See app/api/attendance/time-in.
		 */
		smsSentAt: timestamp("smsSentAt", { withTimezone: true }),
		createdAt: timestamp("createdAt").notNull().default(sql`now()`),
	},
	(table) => [
		// One session per technician per day — this is what actually stops a
		// double Time In, not just client-side gating. A racing double-click
		// hits this constraint instead of creating two open sessions.
		uniqueIndex("technicianAttendance_technician_workDate_idx").on(
			table.technicianId,
			table.workDate
		),
	]
);

/** Recipients who get an SMS whenever any technician times in. Not
 * per-technician — the spec calls for a single managed distribution list. */
/** Recipients who get an SMS whenever any technician times in. Linked to a
 * `users` row rather than a free-typed name+number — the phone number is
 * read live from users.contactNo at send time, so it can never drift out of
 * sync with what's on that person's account, and there's nothing to type
 * incorrectly here. Only Admin/Scheduler roles actually receive the
 * notification (see app/api/attendance/time-in) even if a linked user's
 * role changes later — this table just says "opted in", the role check at
 * send time is what's authoritative. */
export const smsRecipients = pgTable("smsRecipients", {
	id: serial("id").primaryKey(),
	userId: integer("userId")
		.notNull()
		.unique()
		.references(() => users.id, { onDelete: "cascade" }),
	isActive: boolean("isActive").notNull().default(true),
	createdAt: timestamp("createdAt").notNull().default(sql`now()`),
});

export type LocationGeofence = InferSelectModel<typeof locationGeofences>;
export type TechnicianAttendance = InferSelectModel<typeof technicianAttendance>;
export type SmsRecipient = InferSelectModel<typeof smsRecipients>;

/** One row per technician — the latest live GPS state, upserted on every
 * ping from that technician's own device (see POST /api/gps/ping). Not a
 * history table: GPS Monitoring only ever needs "where is this person
 * right now", and a single upserted row is what both the Dashboard's
 * status panel and the 15-second-refresh map read from, without a scan or
 * a DISTINCT ON over a growing log. */
export const technicianGpsStatus = pgTable("technicianGpsStatus", {
	technicianId: integer("technicianId")
		.primaryKey()
		.references(() => users.id, { onDelete: "cascade" }),
	/** Null exactly when gpsEnabled is false — there's no fix to report once
	 * the browser/device denies or disables location. */
	latitude: doublePrecision("latitude"),
	longitude: doublePrecision("longitude"),
	/** Meters, as reported by the Geolocation API. Informational only —
	 * nothing currently gates on it — but cheap to keep since the browser
	 * already provides it on every fix. */
	accuracy: doublePrecision("accuracy"),
	gpsEnabled: boolean("gpsEnabled").notNull().default(false),
	/** When the device took this fix, distinct from updatedAt (when the
	 * server received it) — the two can drift apart under a flaky
	 * connection, and the map should show the technician's actual
	 * last-known position, not a request arrival time. Null alongside a
	 * false gpsEnabled. */
	capturedAt: timestamp("capturedAt", { withTimezone: true }),
	/** Set the moment a GPS-disabled alert SMS is sent for the CURRENT
	 * off episode — cleared back to null the next time this technician
	 * reports gpsEnabled: true. Prevents re-alerting every ~15s for as
	 * long as GPS stays off; see POST /api/gps/ping. */
	lastOffAlertAt: timestamp("lastOffAlertAt", { withTimezone: true }),
	updatedAt: timestamp("updatedAt", { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date()),
});
export type TechnicianGpsStatus = InferSelectModel<typeof technicianGpsStatus>;

/** Append-only log of every real GPS fix a technician's device reports
 * while on duty — what technicianGpsStatus above deliberately doesn't
 * keep (it's a single upserted row, latest fix only, by design, so the
 * live map read stays a cheap point lookup). GPS Monitoring's "path
 * traveled today" trail reads this table; the live current-position dot
 * still reads technicianGpsStatus. Both are written from the same
 * POST /api/gps/ping request — one ping, one upsert here, one insert
 * there — so there's exactly one code path producing GPS data, not two
 * that could drift apart.
 * Not written for {enabled: false} pings (GPS-off signals carry no
 * fix) — only real position reports become trail points. */
export const technicianGpsPings = pgTable(
	"technicianGpsPings",
	{
		id: serial("id").primaryKey(),
		technicianId: integer("technicianId")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		latitude: doublePrecision("latitude").notNull(),
		longitude: doublePrecision("longitude").notNull(),
		accuracy: doublePrecision("accuracy"),
		/** Device fix time, same field this represents on
		 * technicianGpsStatus — what the trail is actually ordered and
		 * plotted by. */
		capturedAt: timestamp("capturedAt", { withTimezone: true }).notNull(),
		createdAt: timestamp("createdAt", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => ({
		// GPS Monitoring's history read is always "one technician, one
		// day, in order" — this composite index is exactly that access
		// pattern, not a general-purpose index added speculatively.
		technicianCapturedAtIdx: index("technicianGpsPings_technicianId_capturedAt_idx").on(
			table.technicianId,
			table.capturedAt
		),
	})
);
export type TechnicianGpsPing = InferSelectModel<typeof technicianGpsPings>;

/**
 * The GPS pin an Admin or Scheduler must be standing at to Time In/Out —
 * the office (or whichever site that person reports to), configured by a
 * Super Admin under Staff GPS Location.
 *
 * Deliberately a SEPARATE table from locationGeofences rather than a reuse
 * of it: that one is keyed by `locationId` (a CLIENT's branch, which is
 * what a technician's itinerary is built from), while this one is keyed by
 * `userId` — office staff aren't scheduled to client sites, so there is no
 * itinerary to derive a fence from the way the Technician flow does. One
 * row per user; a user with no row simply cannot time in yet, which is
 * reported to them as a setup gap rather than as "you're too far away".
 */
export const staffGpsLocations = pgTable("staffGpsLocations", {
	id: serial("id").primaryKey(),
	userId: integer("userId")
		.notNull()
		.unique()
		.references(() => users.id, { onDelete: "cascade" }),
	/** Free-text name for the pin ("Main Office", "Warehouse") — shown on
	 * the Timekeep screen so staff know which site they're being measured
	 * against. */
	label: varchar("label", { length: 60 }).notNull().default("Office"),
	latitude: doublePrecision("latitude").notNull(),
	longitude: doublePrecision("longitude").notNull(),
	/** Allowed distance from the pin, in meters. Same meaning and default
	 * as locationGeofences.radiusMeters. */
	radiusMeters: integer("radiusMeters").notNull().default(150),
	createdAt: timestamp("createdAt").notNull().default(sql`now()`),
	updatedAt: timestamp("updatedAt").notNull().default(sql`now()`),
});
export type StaffGpsLocation = InferSelectModel<typeof staffGpsLocations>;

/**
 * Audit trail for an Admin marking a Pending Maintenance item resolved.
 *
 * Append-only and kept in its own table rather than as columns on
 * `maintain`: the maintenance record is the technician's field report and
 * must stay exactly as it was filed. "This was dealt with, by whom, when,
 * and why" is a separate administrative fact ABOUT that report, not a
 * correction to it — the same reasoning the Reschedule feature used when
 * it refused to mutate the original missed schedule row.
 *
 * `maintainId` is unique: an item is resolved once. Re-resolving is not a
 * second row (that would make "who resolved this" ambiguous); the resolve
 * endpoint rejects it.
 */
export const maintenanceResolutions = pgTable("maintenanceResolutions", {
	id: serial("id").primaryKey(),
	maintainId: integer("maintainId")
		.notNull()
		.unique()
		.references((): AnyPgColumn => maintain.id, { onDelete: "cascade" }),
	/** The Admin who resolved it. Never nullable — an audit entry with no
	 * author is not an audit entry. */
	resolvedByUserId: integer("resolvedByUserId")
		.notNull()
		.references(() => users.id),
	resolvedAt: timestamp("resolvedAt", { withTimezone: true })
		.notNull()
		.defaultNow(),
	/** Required by the spec — an explanation is the point of the trail. */
	notes: text("notes").notNull(),
});
export type MaintenanceResolution = InferSelectModel<typeof maintenanceResolutions>;
