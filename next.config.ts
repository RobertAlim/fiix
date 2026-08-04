import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const securityHeaders = [
	// Force HTTPS for a year (Vercel serves HTTPS; this hardens against downgrade)
	{
		key: "Strict-Transport-Security",
		value: "max-age=31536000; includeSubDomains",
	},
	// Prevent MIME-type sniffing
	{ key: "X-Content-Type-Options", value: "nosniff" },
	// Disallow embedding the app in iframes (clickjacking protection)
	{ key: "X-Frame-Options", value: "SAMEORIGIN" },
	// Don't leak full URLs to third parties
	{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
	// Camera (QR scanner / photo capture) and geolocation (mandatory GPS on
	// maintenance reports) allowed for our own origin only.
	{
		key: "Permissions-Policy",
		value: "camera=(self), microphone=(), geolocation=(self)",
	},
];

const withPWA = withPWAInit({
	dest: "public",
	// Service worker only matters in production; in dev it fights HMR.
	disable: process.env.NODE_ENV === "development",
	// The default start_url caching feature generates a cacheWillUpdate
	// callback that throws "_async_to_generator is not defined" at runtime
	// — a real bug in next-pwa's own bundled code, confirmed harmless to
	// page rendering (it's a fire-and-forget background cache write) but
	// disabled here to stop it firing at all, since it's not needed —
	// IndexedDB, not this cache, is what makes offline report data work.
	cacheStartUrl: false,
	register: true,
	// Bundles worker/index.ts (Background Sync handler) into the generated SW.
	customWorkerSrc: "worker",
	cacheOnFrontEndNav: false,
	workboxOptions: {
		skipWaiting: true,
		clientsClaim: true,
		// Deliberately minimal runtime caching: static assets are cached for
		// resilience, but API calls and pages are always network-only /
		// network-first so authenticated data is never served stale. Offline
		// capability for report DATA comes from IndexedDB, not the HTTP cache.
		runtimeCaching: [
			{
				urlPattern: /\/api\/.*/i,
				handler: "NetworkOnly",
			},
			{
				urlPattern: /\/_next\/static\/.*/i,
				handler: "CacheFirst",
				options: {
					cacheName: "next-static",
					expiration: { maxEntries: 128, maxAgeSeconds: 30 * 86400 },
				},
			},
			{
				urlPattern: /\/_next\/image\?.*/i,
				handler: "StaleWhileRevalidate",
				options: {
					cacheName: "next-image",
					expiration: { maxEntries: 64, maxAgeSeconds: 7 * 86400 },
				},
			},
			{
				urlPattern: /\.(?:png|jpg|jpeg|webp|svg|gif|ico|woff2?)$/i,
				handler: "StaleWhileRevalidate",
				options: {
					cacheName: "static-assets",
					expiration: { maxEntries: 128, maxAgeSeconds: 30 * 86400 },
				},
			},
			{
				urlPattern: ({ request }) => request.mode === "navigate",
				handler: "NetworkFirst",
				options: {
					cacheName: "pages",
					networkTimeoutSeconds: 10,
					expiration: { maxEntries: 32, maxAgeSeconds: 86400 },
				},
			},
		],
	},
});

// Multi-zone deployment under fruitbeanink.com: fruitbeanweb owns the
// domain root and rewrites /fiix/* to this app. Locally NEXT_PUBLIC_BASE_PATH
// is unset, so basePath/assetPrefix are undefined and the app behaves exactly
// as before (served at root). In production set NEXT_PUBLIC_BASE_PATH=/fiix.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

// Prefer serving static assets straight from this app's own deployment host
// (set NEXT_PUBLIC_ASSET_PREFIX to it once known) so they don't double-hop
// through fruitbeanweb's rewrite proxy. Falls back to basePath, which still
// works, just proxied.
const assetPrefix = process.env.NEXT_PUBLIC_ASSET_PREFIX || basePath;

const nextConfig: NextConfig = {
	basePath,
	assetPrefix,
	async headers() {
		return [
			{
				source: "/:path*",
				headers: securityHeaders,
			},
		];
	},
};

export default withPWA(nextConfig);
