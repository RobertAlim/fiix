import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import { ThemeProvider } from "@/app/context/ThemeContext";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/sonner";
import { TanstackProvider } from "@/components/providers/tanstack-provider";
import { apiPath } from "@/lib/base-path";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "Fiix — Printer Maintenance",
	description:
		"Offline-capable printer maintenance and repair tracking for Fruitbean Ink Refilling Station.",
	// favicon.ico and icon.png at app/ are auto-detected by Next.js for
	// <link rel="icon"> — apple-touch-icon needs to be listed explicitly,
	// since that convention predates Next's App Router auto-detection and
	// isn't picked up from the same folder. Wrapped in apiPath() for the
	// same reason app/manifest.ts wraps its icon URLs: a plain string path
	// here is NOT automatically prefixed with the /fiix multi-zone
	// basePath the way next/image or the app/ icon-file convention is.
	icons: {
		apple: apiPath("/assets/apple-touch-icon.png"),
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<ClerkProvider>
			<html lang="en">
				<body
					className={`${geistSans.variable} ${geistMono.variable} font-[family-name:var(--font-geist-sans)] antialiased`}
				>
					<Toaster />
					<TanstackProvider>
						<ThemeProvider>{children}</ThemeProvider>
					</TanstackProvider>
				</body>
			</html>
		</ClerkProvider>
	);
}
