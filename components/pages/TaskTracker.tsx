"use client";

import TaskTracker from "@/components/tracker/task-tracker";

// Full-height, full-width wrapper — no max-width container and no fixed
// padding-driven height, so the two Task Tracker cards can actually use the
// space the dashboard shell gives the page content rather than being capped
// to a narrow centered column.
export default function TaskTrackerPage() {
	return (
		<div className="flex h-[calc(100vh-8rem)] min-h-[560px] w-full flex-col">
			<TaskTracker />
		</div>
	);
}
