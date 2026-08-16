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
import { MoreHorizontal, User, MapPin, CalendarDays, CheckSquare, GripVertical } from "lucide-react";
import { Schedule } from "@/components/columns/schedules/columns";
import { cn } from "@/lib/utils";

interface ScheduleCardProps {
	schedule: Schedule;
	onEditClick: (schedId: number) => void;
	onDeleteClick: (schedId: number) => void;
	onShowDetailsClick: (schedId: number) => void;
	onShowReschedClick: (schedId: number) => void;
	onCardClick?: (schedule: Schedule) => void;
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
	sequenceNumber,
	draggableReorder,
	isDragging,
	isDropTarget,
	onDragStartCard,
	onDragOverCard,
	onDragLeaveCard,
	onDropCard,
	onDragEndCard,
}: ScheduleCardProps) {
	return (
		<Card
			className={cn(
				"relative rounded-xl border shadow-none transition-shadow hover:shadow-sm",
				onCardClick && "cursor-pointer",
				draggableReorder && "cursor-grab active:cursor-grabbing",
				isDragging && "opacity-40",
				isDropTarget && "ring-2 ring-primary"
			)}
			onClick={() => onCardClick?.(schedule)}
			draggable={draggableReorder}
			onDragStart={onDragStartCard}
			onDragOver={onDragOverCard}
			onDragLeave={onDragLeaveCard}
			onDrop={onDropCard}
			onDragEnd={onDragEndCard}
		>
			{sequenceNumber != null && (
				<div
					className="absolute -left-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-primary text-xs font-semibold text-primary-foreground shadow"
					title={`Visit order: ${sequenceNumber}`}
				>
					{sequenceNumber}
				</div>
			)}
			<CardContent className="space-y-3 p-4">
				<div className="flex items-start justify-between gap-2">
					<div className="flex items-center gap-2">
						{draggableReorder && (
							<GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
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
							<DropdownMenuItem onClick={() => onEditClick(Number(schedule.id))}>
								Edit
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => onDeleteClick(Number(schedule.id))}>
								Delete
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onClick={() => onShowDetailsClick(Number(schedule.id))}
							>
								Show Details
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => onShowReschedClick(Number(schedule.id))}
							>
								Reschedule
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>

				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<MapPin className="h-3.5 w-3.5 shrink-0" />
					<span className="capitalize">
						{schedule.client} — {schedule.location}
					</span>
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
					<Badge className={priorityBadgeClass(schedule.priority)}>
						{schedule.priority}
					</Badge>
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
