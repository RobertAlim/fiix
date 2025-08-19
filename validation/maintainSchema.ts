import { z } from "zod";

const optionSchema = z.object({
	value: z.number(),
	label: z.string(),
});

export const maintainFormSchema = z
	.object({
		printerId: z.number(),
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
		signPath: z.string().min(1, { message: "Signature is required" }),
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
