import React from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import heroImage from "@/assets/hero-image.png";
import Link from "next/link";
import { SignInButton, SignedIn, SignedOut } from "@clerk/nextjs";

// Required because this page uses SignedIn/SignedOut, which need real
// per-request auth state — without this, Next.js tries to statically
// pre-render the page at build time (outside any request/middleware
// context), and Clerk throws.
export const dynamic = "force-dynamic";

const LandingPage = () => {
	return (
		<section className="w-full py-12 md:py-24 lg:py-32 bg-background">
			<div className="container px-4 md:px-6">
				<div className="grid gap-6 lg:grid-cols-[1fr_500px] lg:gap-12 xl:grid-cols-[1fr_550px]">
					<div className="flex flex-col justify-center space-y-4">
						<div className="space-y-2">
							<h1 className="text-3xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none">
								Welcome to Fiix
							</h1>
							<p className="max-w-[600px] text-muted-foreground md:text-xl">
								Fiix is the smart, all-in-one platform designed to streamline
								and track printer maintenance—built specifically for Fruitbean
								Ink Refilling Station.
							</p>
						</div>
						{/* Uses Clerk's Account Portal (hosted) sign-in — the embedded
						    <SignIn/> widget on /sign-in does not render correctly in
						    this Next.js 15 + basePath + catch-all-route combination;
						    Account Portal is Clerk's own infra and is unaffected. */}
						<div className="flex flex-col gap-2 min-[400px]:flex-row">
							<SignedOut>
								<SignInButton mode="redirect">
									<Button size="lg" className="px-8">
										Get Started
									</Button>
								</SignInButton>
							</SignedOut>
							<SignedIn>
								<Button size="lg" className="px-8" asChild>
									<Link href="/dashboard">Go to Dashboard</Link>
								</Button>
							</SignedIn>
							<Button size="lg" variant="outline" className="px-8">
								Learn More
							</Button>
						</div>
					</div>
					<div className="flex items-center justify-center rounded-2xl overflow-hidden">
						<Image
							src={heroImage}
							width={800}
							height={450}
							alt="Placeholder for Fiix hero image"
							className="object-cover"
						/>
					</div>
				</div>
			</div>
		</section>
	);
};

export default LandingPage;
