"use client";

// components/tracker/collection-modal.tsx
//
// The "Collection"-type Support Service's payment-recording form —
// opened by clicking the Schedule Details card when
// supportService.supportServiceType === "Collection" (see
// task-tracker.tsx). Client and ScheduleID are supplied by the caller
// (already known from the selected schedule/support service — no reason
// to make the Admin re-pick a client they already navigated to), Year
// and Month default to the current date, everything else starts blank.
//
// GET /api/collections?scheduleId= returns EVERY collection already
// saved for this schedule (shown below as a read-only history list) —
// but the form itself is ALWAYS open and usable, regardless of whether
// any exist. A single schedule/client can legitimately have several
// collections (delayed check payments, multiple checks released in one
// visit) — the ONLY thing that's actually a duplicate is the exact same
// (client, year, month, amount) combination, which the POST route
// checks and rejects with a 409. There's no scheduleId-based "already
// exists" gate anymore — the previous version disabled the entire form
// the moment ANY record existed for the schedule, which is exactly the
// bug this rewrite fixes.
import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
	DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

import { fetchData } from "@/lib/fetchData";
import { showAppToast } from "@/components/ui/apptoast";

const PAYMENT_MODES = ["Check", "Cash", "GCash", "Deposit", "Bank Transfer"] as const;
const MONTHS = [
	"January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December",
] as const;

// Mirrors validation/collectionSchema.ts's server-side shape — kept as a
// separate client copy (not imported) since the two run in different
// bundles and the form's own field shapes (a Date object for the picker,
// a formatted-string amount before parsing) diverge slightly from what
// the API actually receives.
const collectionFormSchema = z.object({
	year: z.number().int().min(2000).max(2100),
	month: z.number().int().min(1).max(12),
	amount: z.number().positive({ message: "Enter an amount greater than 0." }),
	status: z.enum(["Paid", "Unpaid"]),
	modeOfPayment: z.enum(PAYMENT_MODES),
	receivedAt: z.date({ required_error: "Select the date received." }),
	bankName: z.string().optional(),
	checkNo: z.string().optional(),
	notes: z.string().optional(),
});
type CollectionFormData = z.infer<typeof collectionFormSchema>;

interface ExistingCollection {
	id: number;
	amount: number;
	status: "Paid" | "Unpaid";
	modeOfPayment: string;
	receivedAt: string;
	bankName: string | null;
	checkNo: string | null;
	notes: string | null;
	year: number;
	month: number;
}

interface CollectionModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	clientId: number;
	clientName: string;
	supportServiceId: number;
	scheduleId: number;
}

/** Formats a raw number as "12,345.67" for display in the amount field —
 *  no currency symbol prefixed here (the Label already says "Amount"),
 *  just the thousand-separator + fixed 2-decimal formatting the request
 *  asked for. */
function formatAmountDisplay(value: number | null): string {
	if (value == null || Number.isNaN(value)) return "";
	return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** The inverse — strips thousand separators and parses back to a plain
 *  number, or null if what's left isn't a valid number (an empty field,
 *  or a user mid-typing something like "12,"). */
function parseAmountInput(raw: string): number | null {
	const cleaned = raw.replace(/,/g, "").trim();
	if (cleaned === "") return null;
	const n = Number(cleaned);
	return Number.isFinite(n) ? n : null;
}

function freshDefaults(now: Date): CollectionFormData {
	return {
		year: now.getFullYear(),
		month: now.getMonth() + 1,
		status: "Unpaid",
		modeOfPayment: "Cash",
		receivedAt: now,
		amount: undefined as unknown as number,
		bankName: "",
		checkNo: "",
		notes: "",
	};
}

export function CollectionModal({
	open,
	onOpenChange,
	clientId,
	clientName,
	supportServiceId,
	scheduleId,
}: CollectionModalProps) {
	const queryClient = useQueryClient();
	const now = React.useMemo(() => new Date(), []);

	// Every collection already recorded for this schedule — informational
	// history shown alongside the (always-editable) form, not a gate on
	// it. See this file's header comment.
	const existingQuery = useQuery<{ data: ExistingCollection[] }>({
		queryKey: ["collections", scheduleId],
		queryFn: () =>
			fetchData<{ data: ExistingCollection[] }>(
				`/api/collections?scheduleId=${scheduleId}`
			),
		enabled: open,
	});

	const {
		control,
		register,
		handleSubmit,
		reset,
		formState: { errors },
	} = useForm<CollectionFormData>({
		resolver: zodResolver(collectionFormSchema),
		defaultValues: freshDefaults(now),
	});

	// Resets to a fresh, blank form every time the modal is opened, and
	// again after each successful save (see onSuccess below) — the form
	// is ALWAYS for entering a NEW collection, never for editing an
	// existing one (there's no "the" existing record anymore; there can
	// be several, shown read-only above the form instead).
	React.useEffect(() => {
		if (open) reset(freshDefaults(now));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, scheduleId]);

	const saveMutation = useMutation({
		mutationFn: (data: CollectionFormData) =>
			fetchData("/api/collections", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					clientId,
					supportServiceId,
					scheduleId,
					year: data.year,
					month: data.month,
					amount: data.amount,
					status: data.status,
					modeOfPayment: data.modeOfPayment,
					receivedAt: format(data.receivedAt, "yyyy-MM-dd"),
					bankName: data.bankName || undefined,
					checkNo: data.checkNo || undefined,
					notes: data.notes || undefined,
				}),
			}),
		onSuccess: (_result, submittedData) => {
			showAppToast({
				message: "Collection saved",
				description: `${clientName} — ${MONTHS[submittedData.month - 1]} ${submittedData.year}`,
				position: "top-right",
				color: "success",
			});
			queryClient.invalidateQueries({ queryKey: ["collections", scheduleId] });
			// Modal STAYS OPEN, form resets to blank — a technician's visit
			// can legitimately produce several collections (multiple
			// checks released at once, a delayed one added later the same
			// session); closing after every single save would make
			// entering more than one needlessly slower. Cancel/the dialog's
			// own close button is how they leave when actually done.
			reset(freshDefaults(now));
		},
		onError: (err: unknown) => {
			// The API returns a plain-text 409 message for the duplicate
			// case (fetchData's own error-handling wraps it) — surfaced
			// directly rather than a generic "failed to save," since the
			// Admin should see WHY it was rejected. This is now the ONLY
			// place duplicate prevention shows up in the UI — there's no
			// more pre-emptive whole-form disabling.
			const message = err instanceof Error ? err.message : "Failed to save collection.";
			showAppToast({
				message: message.includes("already exists")
					? "Duplicate collection"
					: "Couldn't save collection",
				description: message.includes("already exists")
					? "A collection for this exact client, month, year, and amount already exists. Change one of those to save a different collection."
					: message,
				position: "top-right",
				color: "error",
			});
		},
	});

	const onSubmit = (data: CollectionFormData) => saveMutation.mutate(data);
	const existing = existingQuery.data?.data ?? [];

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Collection</DialogTitle>
					<DialogDescription>
						Record a payment collected for this Support Service. A schedule can have
						more than one collection — e.g. a delayed check, or several checks
						released in one visit.
					</DialogDescription>
				</DialogHeader>

				{existingQuery.isLoading ? (
					<div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
						<Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading previous
						collections…
					</div>
				) : existing.length > 0 ? (
					<div className="space-y-2 rounded-md border bg-muted/30 p-3">
						<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
							Already Recorded for This Schedule ({existing.length})
						</p>
						<div className="max-h-32 space-y-1.5 overflow-y-auto">
							{existing.map((c) => (
								<div
									key={c.id}
									className="flex items-center justify-between rounded bg-background px-2 py-1.5 text-sm"
								>
									<span>
										{MONTHS[c.month - 1]} {c.year} — ₱
										{c.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
									</span>
									<Badge variant={c.status === "Paid" ? "default" : "secondary"}>
										{c.status}
									</Badge>
								</div>
							))}
						</div>
					</div>
				) : null}

				{existing.length > 0 && <Separator />}

				<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
					<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
						{existing.length > 0 ? "Add Another Collection" : "New Collection"}
					</p>

					<div className="space-y-1.5">
						<Label>Client</Label>
						<Input value={clientName} disabled readOnly />
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label>Year</Label>
							<Input type="number" {...register("year", { valueAsNumber: true })} />
						</div>
						<div className="space-y-1.5">
							<Label>Month</Label>
							<Controller
								control={control}
								name="month"
								render={({ field }) => (
									<Select
										value={String(field.value)}
										onValueChange={(v) => field.onChange(Number(v))}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{MONTHS.map((m, i) => (
												<SelectItem key={m} value={String(i + 1)}>
													{m}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								)}
							/>
						</div>
					</div>

					<div className="space-y-1.5">
						<Label>Amount</Label>
						{/* Plain text input (not type="number") specifically so the
						    thousand-separator display ("12,500.00") can be shown
						    while typing — a native number input strips anything
						    that isn't a raw digit/decimal, which would fight the
						    formatting the request asked for. Reformats on blur;
						    while focused, shows whatever the user is typing
						    as-is so commas don't get inserted mid-keystroke in a
						    way that jumps the cursor around. */}
						<Controller
							control={control}
							name="amount"
							render={({ field }) => (
								<AmountInput value={field.value ?? null} onChange={field.onChange} />
							)}
						/>
						{errors.amount && (
							<p className="text-xs text-destructive">{errors.amount.message}</p>
						)}
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label>Status</Label>
							<Controller
								control={control}
								name="status"
								render={({ field }) => (
									<Select value={field.value} onValueChange={field.onChange}>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="Paid">Paid</SelectItem>
											<SelectItem value="Unpaid">Unpaid</SelectItem>
										</SelectContent>
									</Select>
								)}
							/>
						</div>
						<div className="space-y-1.5">
							<Label>Mode of Payment</Label>
							<Controller
								control={control}
								name="modeOfPayment"
								render={({ field }) => (
									<Select value={field.value} onValueChange={field.onChange}>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{PAYMENT_MODES.map((m) => (
												<SelectItem key={m} value={m}>
													{m}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								)}
							/>
						</div>
					</div>

					<div className="space-y-1.5">
						<Label>Timestamp (date received)</Label>
						<Controller
							control={control}
							name="receivedAt"
							render={({ field }) => (
								<DatePicker
									selectedDate={field.value}
									onDateSelect={(d) => d && field.onChange(d)}
								/>
							)}
						/>
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label>Bank Name</Label>
							<Input placeholder="e.g. BPI, BDO" {...register("bankName")} />
						</div>
						<div className="space-y-1.5">
							<Label>Check No.</Label>
							<Input {...register("checkNo")} />
						</div>
					</div>

					<div className="space-y-1.5">
						<Label>Notes</Label>
						<Textarea rows={3} {...register("notes")} />
					</div>

					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
							Close
						</Button>
						<Button type="submit" disabled={saveMutation.isPending}>
							{saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
							Save
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

/** The thousand-separator amount field — a small controlled component
 *  rather than inlined in the form above, since it needs its own local
 *  "what's literally in the box right now" state distinct from the
 *  parsed numeric value react-hook-form holds (see this file's header
 *  comment on why a plain number input can't show "12,500.00" while
 *  being typed into). */
function AmountInput({
	value,
	onChange,
}: {
	value: number | null;
	onChange: (value: number | undefined) => void;
}) {
	const [focused, setFocused] = React.useState(false);
	const [rawText, setRawText] = React.useState(() => formatAmountDisplay(value));

	// Keep the field's displayed text in sync with the parsed value when
	// NOT focused (e.g. a programmatic reset() after a successful save)
	// — while focused, the user's own keystrokes are the source of truth
	// instead, so this doesn't fight their typing.
	React.useEffect(() => {
		if (!focused) setRawText(formatAmountDisplay(value));
	}, [value, focused]);

	return (
		<Input
			inputMode="decimal"
			value={rawText}
			placeholder="0.00"
			onFocus={() => setFocused(true)}
			onChange={(e) => {
				setRawText(e.target.value);
				onChange(parseAmountInput(e.target.value) ?? undefined);
			}}
			onBlur={() => {
				setFocused(false);
				const parsed = parseAmountInput(rawText);
				setRawText(formatAmountDisplay(parsed));
			}}
		/>
	);
}
