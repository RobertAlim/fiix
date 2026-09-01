// validation/supportServiceSchema.ts
import { z } from "zod";
import { gpsFixSchema } from "@/validation/maintainSchema";

// Exactly ONE of these two is present per submission:
//   - supportServiceId: completing a Scheduler-created Support Service
//     row that already exists (the original, dedicated-module case).
//   - scheduleId: documenting a printer-less `schedules` row for the
//     first time — the "a Schedule was set for a client but no printer
//     itinerary selected" case from the original request. No
//     supportServices row exists yet; the completion route creates one
//     and links it back via scheduleId (see db/schema.ts's own comment
//     on that column).
//
// clientId/locationId/supportServiceTypeId are always sent by the
// client either way (the schedule-sourced form already has them from
// the itinerary data it was opened with — no extra round trip needed to
// re-fetch what the technician's device already has in hand).
export const supportServiceCompleteSchema = z
	.object({
		supportServiceId: z.number().optional(),
		scheduleId: z.number().optional(),
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
		// Optional: an "Achieved" activity requires both (checked
		// server-side in the route, same as maintain's printCount
		// re-check), a "Not Achieved" one legitimately has neither.
		photoPath: z.string().max(1024).optional(),
		signPath: z.string().max(1024).optional(),
		clientUuid: z.string().uuid(),
	})
	.refine((data) => (data.supportServiceId != null) !== (data.scheduleId != null), {
		message: "Exactly one of supportServiceId or scheduleId is required.",
		path: ["supportServiceId"],
	});

export type SupportServiceCompleteData = z.infer<typeof supportServiceCompleteSchema>;
