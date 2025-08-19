"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
	userProfileSchema,
	type UserProfileInput,
} from "@/validation/userProfile";
import { updateUserProfile } from "@/app/api/actions/update-user";

import {
	Card,
	CardHeader,
	CardTitle,
	CardDescription,
	CardContent,
	CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { showAppToast } from "../ui/apptoast";
import { ensureError } from "@/lib/errors";

type Props = {
	user: {
		id: number;
		firstName: string;
		lastName: string;
		middleName: string | null;
		contactNo: string | null;
		birthday: string | Date | null;
		email: string;
		role: string | null;
		isActive: boolean | null;
	};
};

function toYYYYMMDD(value: string | Date | null | undefined) {
	if (!value) return "";
	if (typeof value === "string") return value.slice(0, 10);
	const d = value;
	const mm = String(d.getMonth() + 1).padStart(2, "0");
	const dd = String(d.getDate()).padStart(2, "0");
	return `${d.getFullYear()}-${mm}-${dd}`;
}

export function ProfileForm({ user }: Props) {
	const [pending, startTransition] = React.useTransition();

	const form = useForm<UserProfileInput>({
		resolver: zodResolver(userProfileSchema),
		defaultValues: {
			id: user.id,
			firstName: user.firstName ?? "",
			lastName: user.lastName ?? "",
			middleName: user.middleName ?? "",
			contactNo: user.contactNo ?? "",
			birthday: toYYYYMMDD(user.birthday),
			email: user.email ?? "",
		},
		mode: "onSubmit",
	});

	const onSubmit = (values: UserProfileInput) => {
		startTransition(async () => {
			try {
				await updateUserProfile(values);
				showAppToast({
					message: "Your profile has been updated successfully",
					description: "Profile updated.",
					position: "top-right",
					color: "success", // This will influence the default icon color and potential border
				});
			} catch (error: unknown) {
				const err = ensureError(error);
				showAppToast({
					message: "Failed to update your profile. " + err,
					description: "Profile update failed.",
					position: "top-right",
					color: "error", // This will influence the default icon color and potential border
				});
			}
		});
	};

	return (
		<Card className="max-w-2xl">
			<CardHeader>
				<CardTitle>My Profile</CardTitle>
				<CardDescription>
					View and update your personal information.
				</CardDescription>
			</CardHeader>

			<form onSubmit={form.handleSubmit(onSubmit)}>
				<CardContent className="grid gap-6">
					{/* Name */}
					<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
						<div>
							<Label htmlFor="firstName">First name</Label>
							<Input id="firstName" {...form.register("firstName")} />
							{form.formState.errors.firstName && (
								<p className="text-sm text-red-500 mt-1">
									{form.formState.errors.firstName.message}
								</p>
							)}
						</div>
						<div>
							<Label htmlFor="middleName">Middle name</Label>
							<Input id="middleName" {...form.register("middleName")} />
							{form.formState.errors.middleName && (
								<p className="text-sm text-red-500 mt-1">
									{form.formState.errors.middleName.message}
								</p>
							)}
						</div>
						<div>
							<Label htmlFor="lastName">Last name</Label>
							<Input id="lastName" {...form.register("lastName")} />
							{form.formState.errors.lastName && (
								<p className="text-sm text-red-500 mt-1">
									{form.formState.errors.lastName.message}
								</p>
							)}
						</div>
					</div>

					{/* Contact / Birthday */}
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div>
							<Label htmlFor="contactNo">Contact No (11 digits)</Label>
							<Input
								id="contactNo"
								inputMode="numeric"
								maxLength={11}
								{...form.register("contactNo")}
							/>
							{form.formState.errors.contactNo && (
								<p className="text-sm text-red-500 mt-1">
									{form.formState.errors.contactNo.message}
								</p>
							)}
						</div>
						<div>
							<Label htmlFor="birthday">Birthday</Label>
							<Input id="birthday" type="date" {...form.register("birthday")} />
							{form.formState.errors.birthday && (
								<p className="text-sm text-red-500 mt-1">
									{form.formState.errors.birthday.message}
								</p>
							)}
						</div>
					</div>

					{/* Email */}
					<div>
						<Label htmlFor="email">Email</Label>
						<Input id="email" type="email" {...form.register("email")} />
						{form.formState.errors.email && (
							<p className="text-sm text-red-500 mt-1">
								{form.formState.errors.email.message}
							</p>
						)}
					</div>

					{/* Read-only flags */}
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div>
							<Label htmlFor="role">Role</Label>
							<Input id="role" value={user.role ?? ""} disabled />
						</div>
						<div className="flex items-center justify-between rounded-lg border p-3">
							<div className="space-y-1">
								<span className="text-sm font-medium leading-none">Active</span>
								<p className="text-xs text-muted-foreground">
									Managed by administrators
								</p>
							</div>
							<Switch checked={!!user.isActive} disabled />
						</div>
					</div>
				</CardContent>

				<CardFooter className="justify-end mt-4">
					<Button type="submit" disabled={pending}>
						{pending ? "Updating..." : "Update"}
					</Button>
				</CardFooter>
			</form>
		</Card>
	);
}
