"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, User, MapPin, CalendarDays, CheckSquare, GripVertical, Lock, Navigation, Pencil } from "lucide-react";
import { Schedule } from "@/components/columns/schedules/columns";
import { cn } from "@/lib/utils";

interface ScheduleCardProps {
	schedule: Schedule;
	onEditClick: (schedId: number) => void;
	onDeleteClick: (schedId: number) => void;
	onShowDetailsClick: (schedId: number) => void;
	onShowReschedClick: (schedId: number) => void;
	onCardClick?: (schedule: Schedule) => void;
	/** True when this is the itinerary currently loaded into the edit form
	 * — the Scheduler clicked it (or it was opened for edit/reschedule some
	 * other way) and its details are what "Save"/"Update" will act on right
	 * now. Stays true for as long as that's the case, not just on the
	 * click itself, so there's no ambiguity about which client/location is
	 * being changed. Visually distinct from `isDropTarget` (a transient
	 * hover state during drag-and-drop reordering) — both can theoretically
	 * be true at once without looking the same. */
	isSelected?: boolean;
	/**
	 * 1-based position in the current itinerary order, shown as a corner
	 * badge. Only passed when the grid is actually reorderable (a
	 * technician + date have been picked on the Schedule page) — cards
	 * shown from other contexts simply omit it and render unchanged.
	 */
	sequenceNumber?: number;
	/** Native HTML5 drag-and-drop wiring for reordering. All optional and
	 * only meaningful together — a card without `onReorderDrop` doesn't
	 * become draggable even if the others are passed, since dropping it
	 * would have nowhere to go. */
	draggableReorder?: boolean;
	isDragging?: boolean;
	isDropTarget?: boolean;
	onDragStartCard?: (e: React.DragEvent<HTMLDivElement>) => void;
	onDragOverCard?: (e: React.DragEvent<HTMLDivElement>) => void;
	onDragLeaveCard?: (e: React.DragEvent<HTMLDivElement>) => void;
	onDropCard?: (e: React.DragEvent<HTMLDivElement>) => void;
	onDragEndCard?: (e: React.DragEvent<HTMLDivElement>) => void;
	/** True once the technician has timed in today AND this card is
	 * currently the first stop — the same business rule PATCH
	 * /api/schedule/sequence enforces server-side. Shows a lock icon in
	 * place of the drag handle and makes the card inert for drag/drop
	 * (neither draggable nor a valid drop target), while every other card
	 * stays freely reorderable among themselves. */
	isLocked?: boolean;
	/** Opens Google Maps directions ending at this stop (from the previous
	 * stop's location, or from the device's current location for the
	 * first stop — see lib/maps.ts). The icon always renders per-card;
	 * pass `navigateDisabled` (with an explanatory `navigateTitle`) rather
	 * than omitting `onNavigate` when there's no geofence pin to route
	 * to/from, so the control is consistently in the same place on every
	 * card instead of appearing/disappearing.
	 */
	onNavigate?: () => void;
	navigateDisabled?: boolean;
	navigateTitle?: string;
	/** True when this schedule's date is before today — the visit already
	 * happened (or didn't), so the record is history and shouldn't be
	 * changed after the fact. Hides Edit/Delete/Reschedule from the
	 * dropdown (Show Details stays — viewing is always allowed) and makes
	 * the card inert for drag-and-drop reordering, same as `isLocked` but
	 * for a different reason (a past date, not "technician already timed
	 * in today") — the two are independent and can never both apply to the
	 * same card (isLocked only ever fires for today's first stop). */
	readOnly?: boolean;
}

function priorityBadgeClass(priority: string): string {
	const p = priority.toLowerCase();
	if (p.includes("high") || p.includes("urgent")) {
		return "bg-destructive text-white";
	}
	if (p.includes("medium") || p.includes("mid")) {
		return "bg-warning text-warning-foreground";
	}
	return "bg-info text-info-foreground";
}

export function ScheduleCard({
	schedule,
	onEditClick,
	onDeleteClick,
	onShowDetailsClick,
	onShowReschedClick,
	onCardClick,
	isSelected,
	sequenceNumber,
	draggableReorder,
	isDragging,
	isDropTarget,
	onDragStartCard,
	onDragOverCard,
	onDragLeaveCard,
	onDropCard,
	onDragEndCard,
	isLocked,
	onNavigate,
	navigateDisabled,
	navigateTitle,
	readOnly,
}: ScheduleCardProps) {
	const draggable = draggableReorder && !isLocked && !readOnly;
	return (
		<Card
			className={cn(
				"relative rounded-xl border shadow-none transition-shadow hover:shadow-sm",
				onCardClick && "cursor-pointer",
				draggable && "cursor-grab active:cursor-grabbing",
				isDragging && "opacity-40",
				// isSelected is the persistent "this is what you're editing"
				// state — deliberately a heavier treatment (thicker ring,
				// offset, tinted background, colored border) than
				// isDropTarget's plain ring below, which is only ever shown
				// for the instant a drag hovers over a card. The two are
				// visually distinguishable even in the rare case both are
				// true at once (dragging a different card over the selected
				// one).
				isSelected &&
					"border-primary bg-primary/5 shadow-md ring-2 ring-primary ring-offset-2 ring-offset-background",
				isDropTarget && !isSelected && "ring-2 ring-primary"
			)}
			onClick={() => onCardClick?.(schedule)}
			draggable={draggable}
			onDragStart={draggable ? onDragStartCard : undefined}
			onDragOver={isLocked || readOnly ? undefined : onDragOverCard}
			onDragLeave={isLocked || readOnly ? undefined : onDragLeaveCard}
			onDrop={isLocked || readOnly ? undefined : onDropCard}
			onDragEnd={onDragEndCard}
		>
			{isSelected && (
				<div
					className="absolute -right-2 -top-2 z-10 flex items-center gap-1 rounded-full border-2 border-background bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground shadow"
					title="Currently selected for editing"
				>
					<Pencil className="h-3 w-3" />
					Editing
				</div>
			)}
			{sequenceNumber != null && (
				<div
					className={cn(
						"absolute -left-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background text-xs font-semibold shadow",
						isLocked || readOnly
							? "bg-warning text-warning-foreground"
							: "bg-primary text-primary-foreground"
					)}
					title={
						isLocked
							? "Locked — the technician has already timed in for this stop."
							: readOnly
								? "Read-only — this date has passed."
								: `Visit order: ${sequenceNumber}`
					}
				>
					{isLocked || readOnly ? <Lock className="h-3 w-3" /> : sequenceNumber}
				</div>
			)}
			<CardContent className="space-y-3 p-4">
				<div className="flex items-start justify-between gap-2">
					<div className="flex items-center gap-2">
						{draggableReorder && (
							isLocked || readOnly ? (
								<Lock className="h-4 w-4 shrink-0 text-warning" />
							) : (
								<GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
							)
						)}
						<User className="h-4 w-4 text-muted-foreground" />
						<p className="font-semibold capitalize leading-tight">
							{schedule.technician}
						</p>
					</div>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								className="h-8 w-8 p-0"
								onClick={(e) => e.stopPropagation()}
							>
								<span className="sr-only">Open menu</span>
								<MoreHorizontal className="h-4 w-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
							<DropdownMenuLabel>Actions</DropdownMenuLabel>
							{/* Edit/Delete/Reschedule all change the record, so they're
							    hidden (not just disabled) once the date is in the
							    past — "Show Details" is the only action a read-only
							    schedule keeps, since viewing is always allowed. */}
							{!readOnly && (
								<>
									<DropdownMenuItem
										onClick={() => onEditClick(Number(schedule.id))}
									>
										Edit
									</DropdownMenuItem>
									<DropdownMenuItem
										onClick={() => onDeleteClick(Number(schedule.id))}
									>
										Delete
									</DropdownMenuItem>
									<DropdownMenuSeparator />
								</>
							)}
							<DropdownMenuItem
								onClick={() => onShowDetailsClick(Number(schedule.id))}
							>
								Show Details
							</DropdownMenuItem>
							{!readOnly && (
								<DropdownMenuItem
									onClick={() => onShowReschedClick(Number(schedule.id))}
								>
									Reschedule
								</DropdownMenuItem>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>

				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<MapPin className="h-3.5 w-3.5 shrink-0" />
					<span className="min-w-0 flex-1 truncate capitalize">
						{schedule.client} — {schedule.location}
					</span>
					{onNavigate && (
						<Button
							variant="outline"
							size="icon"
							className="h-7 w-7 shrink-0"
							disabled={navigateDisabled}
							onClick={(e) => {
								e.stopPropagation();
								onNavigate();
							}}
							aria-label={navigateTitle ?? "Get directions"}
							title={navigateTitle ?? "Get directions"}
						>
							<Navigation className="h-3.5 w-3.5 text-primary" />
						</Button>
					)}
				</div>

				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<CalendarDays className="h-3.5 w-3.5 shrink-0" />
					<span>{String(schedule.scheduleAt)}</span>
				</div>

				{schedule.notes && (
					<p className="line-clamp-2 rounded-lg bg-muted p-2 text-xs text-muted-foreground">
						{schedule.notes}
					</p>
				)}

				<div className="flex items-center justify-between pt-1">
					<div className="flex items-center gap-2">
						<Badge className={priorityBadgeClass(schedule.priority)}>
							{schedule.priority}
						</Badge>
						{readOnly && (
							<span
								className="flex items-center gap-1 text-xs text-muted-foreground"
								title="This date has passed — view only, no longer editable."
							>
								<Lock className="h-3 w-3" />
								Read-only
							</span>
						)}
					</div>
					{schedule.maintainAll && (
						<span className="flex items-center gap-1 text-xs text-success">
							<CheckSquare className="h-3.5 w-3.5" />
							Maintain All
						</span>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
