"use client";

import TaskTracker from "@/components/tracker/task-tracker";

// Full-height, full-width wrapper — no max-width container. The fixed
// shared-height/flex-fill layout only applies at `lg` and up, where the two
// cards sit side by side and genuinely need to share one bounded height for
// their internal scroll areas to make sense. Below `lg` they stack instead
// (see task-tracker.tsx's grid), and forcing them into that same shared
// height there was the actual bug: two full cards squeezed into one mobile
// viewport's worth of space, each left with almost no room to scroll. Below
// `lg`, height is unconstrained here and each card gets its own generous
// cap instead (see task-tracker.tsx).
export default function TaskTrackerPage() {
	return (
		<div className="flex w-full flex-col lg:h-[calc(100dvh-8rem)] lg:min-h-[560px]">
			<TaskTracker />
		</div>
	);
}
