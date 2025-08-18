import { InferInsertModel, sql } from "drizzle-orm";
import {
	timestamp,
	pgTable,
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
export const clients = pgTable("clients", {
	id: serial("id").primaryKey(),
	name: varchar("name", { length: 100 }).notNull(),
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
	email: varchar("email", { length: 50 }).notNull(),
	role: varchar("role", { length: 15 }),
	isActive: boolean("isActive").default(false),
	clerkId: text("clerkId").notNull(),
	createdAt: timestamp("createdAt")
		.notNull()
		.default(sql`CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila'`),
});

export const maintain = pgTable("maintain", {
	id: serial("id").primaryKey(),
	printerId: integer("printerId").notNull(),
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
	signPath: text("signPath").notNull(),
	createdAt: timestamp("createdAt")
		.notNull()
		.default(sql`CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila'`),
	originMTId: integer("originMTId").references((): AnyPgColumn => maintain.id), // Self-referencing foreign key
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
	createdAt: timestamp("createdAt", { withTimezone: true })
		.notNull()
		.default(sql`CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila'`),
});

export const scheduleDetails = pgTable("scheduleDetails", {
	id: serial("id").primaryKey(),
	scheduleId: integer("scheduleId").notNull(),
	printerId: integer("printerId").notNull(),
	originMTId: integer("mtId"),
	isMaintained: boolean("isMaintained").notNull().default(false),
	maintainedDate: timestamp("maintainedDate"),
});

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
	modelId: integer("modelId").notNull(),
	clientId: integer("clientId").notNull(),
	locationId: integer("locationId").notNull(),
	departmentId: integer("departmentId").notNull(),
	deploymentDate: date("deploymentDate").notNull(),
	deployedClient: integer("clientId").notNull(),
	createdAt: timestamp("createdAt")
		.notNull()
		.default(sql`CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila'`),
});

export const signatories = pgTable("signatories", {
	id: serial("id").primaryKey(),
	firstName: varchar("firstName", { length: 20 }).notNull(),
	lastName: varchar("lastName", { length: 20 }).notNull(),
	clientId: integer("clientId"),
});

export const otps = pgTable("otps", {
	id: serial("id").primaryKey(),
	phone: varchar("phone", { length: 15 }).notNull(),
	code: varchar("code", { length: 6 }).notNull(),
	expiresAt: timestamp("expires_at").notNull(),
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
export const printersRelations = relations(printers, ({ one, many }) => ({
	model: one(models, {
		// Relation to models
		fields: [printers.modelId],
		references: [models.id],
	}),
	department: one(departments, {
		// Relation to departments
		fields: [printers.departmentId],
		references: [departments.id],
	}),
	// A printer can have MANY maintenance records
	maintenanceRecords: many(maintain), // Using 'maintenanceRecords' for the many relation
	// Also relate back to client and location if needed for printer's own data
	client: one(clients, {
		fields: [printers.clientId],
		references: [clients.id],
	}),
	location: one(locations, {
		fields: [printers.locationId],
		references: [locations.id],
	}),
}));

// Maintain relations (add printer and status relations)
export const maintainRelations = relations(maintain, ({ one }) => ({
	printer: one(printers, {
		// Relation back to printer
		fields: [maintain.printerId],
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

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
