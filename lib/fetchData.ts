import { BASE_PATH } from "@/lib/base-path";

// Root-relative app paths ("/api/...") need the basePath prefix manually —
// see lib/base-path.ts for why. Absolute URLs (external APIs, presigned R2
// upload URLs) are passed through untouched.
function resolveUrl(url: string): string {
	if (url.startsWith("/")) return `${BASE_PATH}${url}`;
	return url;
}

export const fetchData = async <T>(
	url: string,
	options?: RequestInit
): Promise<T> => {
	const resolvedUrl = resolveUrl(url);
	const response = await fetch(resolvedUrl, options);

	if (!response.ok) {
		// Handle non-2xx responses. For example, 404 Not Found, 500 Server Error.
		// You can get more details from the response to provide better error messages.
		const errorText = await response.text();
		throw new Error(
			`Failed to fetch data from ${resolvedUrl}: ${response.status} ${response.statusText}. Details: ${errorText}`
		);
	}

	// Attempt to parse JSON. This is robust as it handles cases where the
	// response body might be empty (e.g., a successful DELETE request).
	try {
		// The `await response.json()` can fail on empty responses.
		// We can check the Content-Length or other headers, but a `try...catch` is often cleaner.
		const contentType = response.headers.get("content-type");
		if (contentType && contentType.includes("application/json")) {
			return await response.json();
		}
		// If the response is not JSON, but still successful (like a 204 No Content),
		// we can return a default or just `null`. Here, we cast `null` to `T`.
		return null as T;
	} catch (e) {
		// Catch any JSON parsing errors and re-throw with context.
		throw new Error(`Failed to parse JSON response from ${resolvedUrl}. ${e}`);
	}
};
