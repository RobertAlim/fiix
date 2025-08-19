import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	async headers() {
		return [
			{
				source: "/:path*",
				headers: [
					// Allow camera for your origin. Remove entirely if you don't need to restrict.
					{ key: "Permissions-Policy", value: "camera=(self)" },
				],
			},
		];
	},
};

export default nextConfig;
