// components/ThemeToggle.tsx
"use client";

import { useTheme } from "@/app/context/ThemeContext";
import { Sun, Moon } from "lucide-react";

export const ThemeToggle = () => {
	const { theme, toggleTheme } = useTheme();

	return (
		<button
			onClick={toggleTheme}
			className="p-2 rounded bg-gray-200 dark:bg-gray-700 text-black dark:text-white"
		>
			{theme === "dark" ? <Sun /> : <Moon />}
		</button>
	);
};
