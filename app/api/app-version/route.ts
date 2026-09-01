// app/api/app-version/route.ts
//
// The mandatory-update guardrail's one backend dependency (see the
// mobile app's version-check.ts). Deliberately UNAUTHENTICATED — no
// requireRole()/requireActiveUser() call — because the mobile app checks
// this BEFORE Clerk sign-in even happens; an outdated build has to be
// blocked before it can reach the sign-in screen, and has no token to
// send at that point.
//
// Env-var-backed rather than a database table: bumping the required
// build after a release is then just an env var change + redeploy, no
// migration, no admin UI needed for something that changes maybe once
// per release cycle.
//
// DEFAULTS MATTER HERE: falling back to `1` (not, say, `999999` or
// throwing) if an env var is unset means an unconfigured deployment
// never accidentally locks out every technician — it just doesn't
// enforce anything yet, which is the safe direction for this specific
// feature to fail in. The mobile app treats "can't reach this route at
// all" as fail-closed (blocks); this route itself, once reachable,
// fails OPEN when unconfigured, which is the correct pairing — a
// missing route is a deploy problem worth blocking on, a missing env
// var on a route that DOES exist is not something a technician should
// ever be stuck behind.
import { NextResponse } from "next/server";

export async function GET() {
	return NextResponse.json({
		minBuildNumber: {
			ios: Number(process.env.FIIX_MIN_BUILD_IOS ?? 1),
			android: Number(process.env.FIIX_MIN_BUILD_ANDROID ?? 1),
		},
		updateUrl: {
			ios: process.env.FIIX_UPDATE_URL_IOS ?? "",
			android: process.env.FIIX_UPDATE_URL_ANDROID ?? "",
		},
		message: process.env.FIIX_UPDATE_MESSAGE ?? null,
	});
}
