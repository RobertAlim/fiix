// validation/collectionSchema.ts
import { z } from "zod";

// `amount` is the plain decimal peso value (e.g. 12500.50) all the way
// through — client → this validation → db/schema.ts's `numeric(12,2)`
// column. No centavos conversion anywhere anymore (see the `collections`
// table's own doc comment in db/schema.ts for why numeric(12,2) already
// gives the same "no float rounding error" guarantee integer centavos
// used to).
//
// `.transform()` below normalizes to exactly 2 decimal places at the
// validation boundary — the one acceptable place for a single rounding
// step (immediately followed by handing off to Postgres's exact decimal
// column, not by further float arithmetic) — so "100.256" typed into a
// form field lands as "100.26" everywhere downstream instead of
// depending on the DB column's own rounding behavior to catch it late.
export const collectionCreateSchema = z.object({
	clientId: z.number().int().positive(),
	supportServiceId: z.number().int().positive(),
	scheduleId: z.number().int().positive(),
	year: z.number().int().min(2000).max(2100),
	month: z.number().int().min(1).max(12),
	amount: z
		.number()
		.positive()
		.max(999_999_999.99)
		.transform((val) => Math.round(val * 100) / 100),
	status: z.enum(["Paid", "Unpaid"]),
	modeOfPayment: z.enum(["Check", "Cash", "GCash", "Deposit", "Bank Transfer"]),
	receivedAt: z.string().min(1), // "yyyy-MM-dd"
	bankName: z.string().max(255).optional(),
	checkNo: z.string().max(100).optional(),
	notes: z.string().max(2000).optional(),
});

export type CollectionCreateData = z.infer<typeof collectionCreateSchema>;
