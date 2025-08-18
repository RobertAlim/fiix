"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const RegistrationPage = () => {
	const [middleName, setMiddleName] = useState("");
	const [birthday, setBirthday] = useState("");
	const [contactNo, setContactNo] = useState("");
	const [otpSent, setOtpSent] = useState(false);
	const [otpCode, setOtpCode] = useState("");
	const router = useRouter();

	const sendOtp = async () => {
		const res = await fetch("/api/send-otp", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ phone: contactNo }),
		});

		if (res.ok) {
			toast("OTP sent successfully");
			setOtpSent(true);
		} else {
			const data = await res.json();
			toast("Error sending OTP");
		}
	};

	const verifyAndSave = async () => {
		const res = await fetch("/api/verify-otp", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ phone: contactNo, otp: otpCode }),
		});

		const data = await res.json();
		if (!res.ok) {
			toast("OTP verification failed", { description: data.error });
			return;
		}
		// alert("Verify and Save is Here!!!");

		const saveRes = await fetch("/api/save-profile", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ middleName, birthday, contactNo, isActive: true }),
		});

		if (saveRes.ok) {
			setMiddleName("");
			setBirthday("");
			setContactNo("");

			toast("Profile updated successfully");
			router.push("/dashboard");
		} else {
			toast("Failed to update profile");
		}
	};

	return (
		<Card className="max-w-md mx-auto mt-10 p-6">
			<CardContent className="space-y-4">
				<div>
					<Label htmlFor="middlename">Middle Name</Label>
					<Input
						id="middlename"
						value={middleName}
						onChange={(e) => setMiddleName(e.target.value)}
					/>
				</div>

				<div>
					<Label htmlFor="birthday">Birthday</Label>
					<Input
						id="birthday"
						type="date"
						value={birthday}
						onChange={(e) => {
							setBirthday(e.target.value);
						}}
					/>
				</div>

				<div>
					<Label htmlFor="contactNo">Mobile Number</Label>
					<Input
						id="contactNo"
						placeholder="e.g. 09123456789"
						value={contactNo}
						onChange={(e) => setContactNo(e.target.value)}
					/>
				</div>

				{otpSent && (
					<div>
						<Label htmlFor="otp">Enter OTP</Label>
						<Input
							id="otp"
							value={otpCode}
							onChange={(e) => setOtpCode(e.target.value)}
						/>
					</div>
				)}

				{!otpSent ? (
					<Button className="w-full" onClick={sendOtp}>
						Send OTP
					</Button>
				) : (
					<Button className="w-full" onClick={verifyAndSave}>
						Verify & Save
					</Button>
				)}
			</CardContent>
		</Card>
	);
};

export default RegistrationPage;
