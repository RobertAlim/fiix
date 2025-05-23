import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
	"/sign-in(.*)",
	"/",
	"/api/webhooks(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
	const { userId } = await auth();
	const currentPath = req.nextUrl.pathname;

	// Redirect logged-in users away from `/` to `/dashboard`
	if (
		userId &&
		(req.nextUrl.pathname === "/" || req.nextUrl.pathname === "/dashboard")
	) {
		const baseUrl = req.nextUrl.origin;

		try {
			const relativeApiUrl = `${baseUrl}/api/user-status?userId=${userId}`;
			const res = await fetch(relativeApiUrl, { headers: req.headers });
			const contentType = res.headers.get("content-type");

			if (!res.ok) {
				console.error("API error:", await res.text());
				return NextResponse.next(); // fallback behavior
			}

			if (!contentType?.includes("application/json")) {
				console.error("Invalid content type:", contentType);
				return NextResponse.next(); // fallback
			}

			const data = await res.json();

			// If user is inactive and NOT on profile page → redirect to profile
			if (!data?.isActive && currentPath !== "/profile") {
				const profileUrl = req.nextUrl.clone();
				profileUrl.pathname = "/profile";
				return NextResponse.redirect(profileUrl);
			}

			// If user is active and on "/" → redirect to dashboard
			if (data?.isActive && currentPath === "/") {
				const dashboardUrl = req.nextUrl.clone();
				dashboardUrl.pathname = "/dashboard";
				return NextResponse.redirect(dashboardUrl);
			}
		} catch (err) {
			console.error("Fetch failed:", err);
		}
	}

	if (!isPublicRoute(req)) {
		await auth.protect();
	}
});

export const config = {
	matcher: [
		// Skip Next.js internals and all static files, unless found in search params
		"/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
		// Always run for API routes
		"/(api|trpc)(.*)",
	],
};
