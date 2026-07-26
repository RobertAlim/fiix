import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
	return {
		name: "Fiix — Printer Maintenance",
		short_name: "Fiix",
		description:
			"Offline-capable printer maintenance and repair tracking for Fruitbean Ink Refilling Station.",
		start_url: "/dashboard",
		display: "standalone",
		background_color: "#ffffff",
		theme_color: "#4f46e5",
		icons: [
			{
				src: "/assets/icon-192.png",
				sizes: "192x192",
				type: "image/png",
				purpose: "any",
			},
			{
				src: "/assets/icon-512.png",
				sizes: "512x512",
				type: "image/png",
				purpose: "any",
			},
		],
	};
}
