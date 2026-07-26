import { z } from "zod";

const optionSchema = z.object({
	value: z.number(),
	label: z.string(),
});

export const maintainFormSchema = z
	.object({
		printerId: z.number(),
		deploymentId: z.number(),
		client: optionSchema,
		location: optionSchema.optional(),
		department: optionSchema.optional(),
		model: optionSchema.optional(),
		serialNo: z.string().optional(),

		// Main boolean checkboxes
		replaceUnit: z.boolean().default(false).optional(),
		replaceSerialNo: z.string().optional(),

		replace: z.boolean().default(false).optional(),
		replaceParts: z
			.array(
				z.object({
					partId: z.string().min(1, "Replace part is required"),
					partName: z.string().optional(),
				})
			)
			.default([])
			.optional(),

		repair: z.boolean().default(false).optional(),
		repairParts: z
			.array(
				z.object({
					partId: z.string().min(1, "Repair part is required"),
					partName: z.string().optional(),
				})
			)
			.default([])
			.optional(),

		colorSelected: z.boolean().default(false).optional(),
		cyan: z.boolean().default(false).optional(),
		magenta: z.boolean().default(false).optional(),
		yellow: z.boolean().default(false).optional(),
		black: z.boolean().default(false).optional(),

		status: z.number().min(1, { message: "Status is required" }),

		resetSelected: z.boolean().default(false).optional(),
		resetBox: z.boolean().default(false).optional(),
		resetProgram: z.boolean().default(false).optional(),

		headClean: z.boolean().default(false).optional(),
		inkFlush: z.boolean().default(false).optional(),
		cleanPrinter: z.boolean().default(false).optional(),
		cleanWasteTank: z.boolean().default(false).optional(),
		notes: z.string().optional(),

		userId: z.number(),
		signatoryId: z.number().min(1, { message: "Signatory is required" }),
		signPath: z.string().optional(),
		nozzlePath: z.string().optional(),
		originMTId: z.number().optional(),
		colorGroup: z.unknown().optional(),
		resetGroup: z.unknown().optional(),
	})
	.refine(
		(data) =>
			!data.replace || (data.replaceParts && data.replaceParts.length > 0),
		{
			path: ["replaceParts"],
			message: "Please select at least one replacement part.",
		}
	)
	.refine(
		(data) => !data.repair || (data.repairParts && data.repairParts.length > 0),
		{
			path: ["repairParts"],
			message: "Please select at least one repair part.",
		}
	)
	.refine(
		(data) =>
			!data.colorSelected ||
			data.cyan ||
			data.magenta ||
			data.yellow ||
			data.black,
		{
			path: ["colorGroup"], // or just use a generic path for color
			message: "Please select at least one color.",
		}
	)
	.refine((data) => !data.resetSelected || data.resetBox || data.resetProgram, {
		path: ["resetGroup"],
		message: "Please select at least one reset option.",
	})
	.refine(
		(data) =>
			!data.replaceUnit ||
			(typeof data.replaceSerialNo === "string" &&
				data.replaceSerialNo.trim() !== ""),
		{
			path: ["replaceSerialNo"],
			message: "Please scan the QR code of the unit.",
		}
	);

export type MaintainFormData = z.infer<typeof maintainFormSchema>;

// ---------------------------------------------------------------------------
// Offline-first submission envelope
// ---------------------------------------------------------------------------

/** GPS fix captured on the device. Mandatory for every maintenance report. */
export const gpsFixSchema = z.object({
	latitude: z.number().min(-90).max(90),
	longitude: z.number().min(-180).max(180),
	/** Horizontal accuracy in meters. Must be a sane positive value. */
	accuracy: z.number().positive().max(10_000),
	altitude: z.number().nullable().optional(),
	heading: z.number().min(0).max(360).nullable().optional(),
	speed: z.number().min(0).nullable().optional(),
	/** ISO timestamp from the device at the moment the fix was acquired. */
	capturedAt: z.string().datetime({ offset: true }),
	gpsProvider: z.string().max(50).default("browser-geolocation"),
	isMockLocation: z.boolean().default(false),
});

export type GpsFix = z.infer<typeof gpsFixSchema>;

/** Reverse-geocode result. Optional at submit time — if the device was
 * offline the address is resolved later and the row updated. */
export const geocodeResultSchema = z.object({
	locationName: z.string().max(500),
	formattedAddress: z.string().max(1000),
	city: z.string().max(100).nullable().optional(),
	province: z.string().max(100).nullable().optional(),
	country: z.string().max(100).nullable().optional(),
	postalCode: z.string().max(20).nullable().optional(),
});

export type GeocodeResult = z.infer<typeof geocodeResultSchema>;

export const syncAuditEventSchema = z.object({
	event: z.string().max(50),
	detail: z.string().max(1000).optional(),
	occurredAt: z.string().datetime({ offset: true }).optional(),
});

/**
 * What the sync engine actually POSTs to /api/maintain: the original form
 * data plus the client-generated idempotency UUID and the mandatory GPS fix.
 */
export const maintainSubmitSchema = maintainFormSchema.and(
	z.object({
		clientUuid: z.string().uuid(),
		gps: gpsFixSchema,
		geocode: geocodeResultSchema.nullable().optional(),
		auditTrail: z.array(syncAuditEventSchema).max(100).optional(),
	})
);

export type MaintainSubmitData = z.infer<typeof maintainSubmitSchema>;
