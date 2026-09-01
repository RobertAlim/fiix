// validation/supportServiceSchema.ts
import { z } from "zod";
import { gpsFixSchema } from "@/validation/maintainSchema";

export const supportServiceCompleteSchema = z.object({
	supportServiceId: z.number(),
	supportServiceTypeId: z.number(),
	clientId: z.number(),
	locationId: z.number(),
	technicianId: z.number(),
	signatoryId: z.number(),
	status: z.enum(["Achieved", "Not Achieved"]),
	notes: z.string().max(2000).optional().default(""),
	gps: gpsFixSchema,
	// R2 object keys, already uploaded by the client — same
	// upload-then-post-the-key pattern as maintain.signPath/nozzlePath.
	// Optional: an "Achieved" activity requires both (checked below,
	// same as maintain's server-side printCount re-check), a
	// "Not Achieved" one legitimately has neither.
	photoPath: z.string().max(1024).optional(),
	signPath: z.string().max(1024).optional(),
	clientUuid: z.string().uuid(),
});

export type SupportServiceCompleteData = z.infer<typeof supportServiceCompleteSchema>;
