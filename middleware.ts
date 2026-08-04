import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { apiPath } from "@/lib/base-path";

const isPublicRoute = createRouteMatcher([
	"/sign-in(.*)",
	"/",
	"/api/webhooks(.*)",
]);

// App pages that require the user's account to be ACTIVE and have a role
// assigned. Registration is included: per the activation workflow, an
// inactive user must not be able to reach any part of the application,
// including the profile-completion form — only the account-pending screen.
const isGatedAppPage = createRouteMatcher([
	"/",
	"/dashboard(.*)",
	"/profile(.*)",
	"/scan-qrcode(.*)",
	"/registration(.*)",
]);

const ACTIVE_COOKIE = "fiix_active";
const ACTIVE_COOKIE_MAX_AGE = 5 * 60; // seconds — re-verify at most every 5 min

export default clerkMiddleware(async (auth, req) => {
	const { userId } = await auth();
	const currentPath = req.nextUrl.pathname;

	if (userId && isGatedAppPage(req)) {
		// Cheap path: recently-verified active users with a role skip the
		// status fetch.
		const cachedActive = req.cookies.get(ACTIVE_COOKIE)?.value === "1";

		if (cachedActive) {
			if (currentPath === "/") {
				const dashboardUrl = req.nextUrl.clone();
				dashboardUrl.pathname = "/dashboard";
				return NextResponse.redirect(dashboardUrl);
			}
		} else {
			try {
				// Identity is taken from the forwarded Clerk session cookie —
				// the route no longer accepts a userId parameter.
				const res = await fetch(`${req.nextUrl.origin}${apiPath("/api/user-status")}`, {
					headers: { cookie: req.headers.get("cookie") ?? "" },
				});

				if (
					res.ok &&
					res.headers.get("content-type")?.includes("application/json")
				) {
					const data = await res.json();

					if (!data?.isActive) {
						const pendingUrl = req.nextUrl.clone();
						pendingUrl.pathname = "/account-pending";
						pendingUrl.search = "";
						return NextResponse.redirect(pendingUrl);
					}

					if (!data?.role) {
						const pendingUrl = req.nextUrl.clone();
						pendingUrl.pathname = "/account-pending";
						pendingUrl.search = "?reason=no-role";
						return NextResponse.redirect(pendingUrl);
					}

					// Active with a role assigned.
					let response: NextResponse;
					if (currentPath === "/") {
						const dashboardUrl = req.nextUrl.clone();
						dashboardUrl.pathname = "/dashboard";
						response = NextResponse.redirect(dashboardUrl);
					} else {
						response = NextResponse.next();
					}
					response.cookies.set(ACTIVE_COOKIE, "1", {
						maxAge: ACTIVE_COOKIE_MAX_AGE,
						httpOnly: true,
						sameSite: "lax",
						secure: process.env.NODE_ENV === "production",
					});
					return response;
				} else {
					console.error("user-status check failed:", res.status);
				}
			} catch (err) {
				console.error("user-status fetch failed:", err);
				// Fail open to avoid locking users out on transient errors.
			}
		}
	}

	if (!isPublicRoute(req)) {
		await auth.protect();
	}
});

export const config = {
	matcher: [
		// The general catch-all pattern below, once Next.js compiles it
		// together with basePath, requires a "/" immediately after the
		// basePath — meaning the bare basePath root itself (just "/fiix",
		// no trailing slash or further path) never matches it and
		// middleware silently never ran there. This explicit entry closes
		// that gap (confirmed by direct testing).
		"/",
		// Skip Next.js internals and all static files, unless found in search params
		"/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
		// Always run for API routes
		"/(api|trpc)(.*)",
	],
};
