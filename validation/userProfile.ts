import { z } from "zod";

export const userProfileSchema = z.object({
	id: z.number().int().positive(),
	firstName: z.string().min(1, "Required").max(20),
	lastName: z.string().min(1, "Required").max(20),
	middleName: z.string().max(20).optional().nullable(),
	contactNo: z
		.union([
			z.string().regex(/^\d{11}$/, "Use 11 digits (e.g., 09XXXXXXXXX)"),
			z.literal(""),
			z.undefined(),
		])
		.transform((v) => (v === "" ? undefined : v)),
	birthday: z
		.string()
		.optional()
		.refine((v) => !v || !Number.isNaN(Date.parse(v)), {
			message: "Invalid date",
		}),
	email: z.string().email().max(50),
});

export type UserProfileInput = z.infer<typeof userProfileSchema>;
