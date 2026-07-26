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
import { MoreHorizontal, User, MapPin, CalendarDays, CheckSquare } from "lucide-react";
import { Schedule } from "@/components/columns/schedules/columns";

interface ScheduleCardProps {
	schedule: Schedule;
	onEditClick: (schedId: number) => void;
	onDeleteClick: (schedId: number) => void;
	onShowDetailsClick: (schedId: number) => void;
	onShowReschedClick: (schedId: number) => void;
	onCardClick?: (schedule: Schedule) => void;
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
}: ScheduleCardProps) {
	return (
		<Card
			className={
				onCardClick
					? "rounded-xl border shadow-none hover:shadow-sm transition-shadow cursor-pointer"
					: "rounded-xl border shadow-none hover:shadow-sm transition-shadow"
			}
			onClick={() => onCardClick?.(schedule)}
		>
			<CardContent className="space-y-3 p-4">
				<div className="flex items-start justify-between gap-2">
					<div className="flex items-center gap-2">
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
