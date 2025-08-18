// types/index.ts
// (Keep your existing Printer interface)
import { users } from "@/db/schema";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export interface Printer {
	id: number;
	serialNo: string;
	model: string;
	client: string;
	location: string;
	department: string;
	deploymentDate: string;
	deployedClient: string;
}

export interface MaintenanceHistory {
	id: number;
	client: string;
	location: string;
	department: string;
	headClean: boolean;
	inkFlush: boolean;
	refillInk: string;
	reset: string;
	cleanPrinter: string;
	cleanWasteTank: string;
	replaceParts: string;
	repairParts: string;
	replaceUnit: boolean;
	replaceSerialNo: string;
	status: string;
	notes: string;
	technician: string;
	signatory: string;
	mtDate: string;
}

export interface MaintenanceOpenIssues {
	id: number;
	serialNo: string;
	client: string;
	location: string;
	department: string;
	model: string;
	status: string;
	technician: string;
	date: string;
	notes?: string; // Assuming 'notes' can also be part of maintain table or derived
}

// Drizzle-Zod helps create Zod schemas directly from your Drizzle schema
export const insertUserSchema = createInsertSchema(users, {
	contactNo: (schema) =>
		schema.regex(
			/^(?:\d{11})?$/,
			"Contact number must be exactly 11 digits or empty"
		),
	firstName: (schema) => schema.min(1, "First name is required"),
	lastName: (schema) => schema.min(1, "Last name is required"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<
	typeof insertUserSchema extends z.ZodType<any, any, any>
		? typeof insertUserSchema
		: never
>;
