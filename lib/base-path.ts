/**
 * Multi-zone deployment: Fiix is mounted at NEXT_PUBLIC_BASE_PATH under
 * fruitbeanink.com (root goes to fruitbeanweb; see next.config.ts's
 * `basePath`, which reads the same env var so the two can't drift apart).
 *
 * next/link, next/navigation (router.push, etc.), and next/image apply the
 * basePath automatically — do NOT wrap those calls with this helper.
 *
 * Everything else built by hand does NOT get the basePath applied
 * automatically (verified against Next's actual behavior, not assumed):
 *   - raw `fetch("/api/...")` calls
 *   - `new URL(path, origin)` in middleware/route handlers
 *   - manifest.ts icon/start_url strings
 *   - service-worker registration/scope paths
 * Those must be prefixed explicitly with `apiPath()` / `BASE_PATH`.
 *
 * Locally, NEXT_PUBLIC_BASE_PATH is left unset, so this is a no-op and the
 * app runs at root exactly as before.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Prefix an absolute app path ("/api/...", "/dashboard") with BASE_PATH. */
export function apiPath(path: string): string {
	return `${BASE_PATH}${path}`;
}
