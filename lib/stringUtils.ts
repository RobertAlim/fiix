/**
 * Converts a string to Proper Case (Title Case).
 * @param str The input string.
 * @returns The string in Proper Case.
 */
export const toProperCase = (str: string): string => {
	if (!str) {
		return "";
	}

	return str.replace(
		/\w\S*/g,
		(txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
	);
};

/**
 * Converts a string to Upper Case.
 * @param str The input string.
 * @returns The string in Upper Case.
 */
export const toUpperCase = (str: string): string => {
	if (!str) {
		return "";
	}

	return str.toUpperCase();
};
