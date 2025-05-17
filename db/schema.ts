import {
	timestamp,
	pgTable,
	serial,
	text,
	date,
	integer,
	boolean,
	varchar,
} from "drizzle-orm/pg-core";

//RELATIONAL TABLES****************************************************************************************
export const clients = pgTable("clients", {
	id: serial("id").primaryKey(),
	name: varchar("name", { length: 100 }).notNull(),
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

export const statuses = pgTable("statuses", {
	id: serial("id").primaryKey(),
	name: varchar("name", { length: 50 }).notNull(),
	subName: varchar("subname", { length: 100 }),
});

//TRANSACTIONAL TABLES****************************************************************************************
export const users = pgTable("users", {
	id: serial("id").primaryKey(),
	firstName: varchar("firstName", { length: 20 }).notNull(),
	lastName: varchar("lastName", { length: 20 }).notNull(),
	middleName: varchar("middleName", { length: 20 }),
	contactNo: varchar("contactNo", { length: 11 }).notNull(),
	birthday: date("birthday").notNull(),
	email: varchar("email", { length: 50 }).notNull(),
	role: varchar("role", { length: 15 }),
	isActive: boolean("isActive").default(false),
	clerkId: text("clerkId").notNull(),
	createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const maintain = pgTable("maintain", {
	id: serial("id").primaryKey(),
	printerId: integer("printerId").notNull(),
	clientId: integer("clientId").notNull(),
	departmentId: integer("departmentId"),
	unitReplaceId: integer("unitReplaceId"),
	userId: integer("userId").notNull(),
	signatoryId: integer("signatoryId").notNull(),
	createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const status = pgTable("status", {
	id: serial("id").primaryKey(),
	mtId: integer("mtId").notNull(),
	statusId: integer("statusId").notNull(),
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
	departmentId: integer("departmentId").notNull(),
	createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const signatories = pgTable("signatories", {
	id: serial("id").primaryKey(),
	firstName: varchar("firstName", { length: 20 }).notNull(),
	lastName: varchar("lastName", { length: 20 }).notNull(),
	clientId: integer("clientId"),
});
