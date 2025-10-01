"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ComboBoxResponsive, ComboboxItem } from "@/components/ui/combobox";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchData } from "@/lib/fetchData";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogFooter,
	DialogTitle,
} from "@/components/ui/dialog";
import { QrCode } from "lucide-react";
import Select from "react-select";
import { useEffect, useState, useMemo } from "react";
import {
	Replace,
	Wrench,
	Signature,
	Loader2,
	PlusIcon,
	CheckIcon,
} from "lucide-react";

import SignaturePad from "@/components/SignaturePad";
import { useUserStore } from "@/state/userStore";
import { format } from "date-fns";
import { showAppToast } from "../ui/apptoast";
import { v4 as uuidv4 } from "uuid";

import { ScanQRCodeModalContent } from "@/components/ScanQRCodeModalContent";

import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
	maintainFormSchema,
	MaintainFormData,
} from "@/validation/maintainSchema";
import { useRouter } from "next/navigation"; // if not alread
import Image from "next/image";
import { CameraCapture } from "../CameraCapture";
import { ensureError } from "@/lib/errors";
import { base64ToFile } from "@/lib/fileConverter";

type item = {
	label: string;
	value: string;
};

interface Client {
	id: string;
	name: string;
}

export default function MaintenancePage({
	parts,
	status,
	serialNo,
	originMTId,
	schedDetailsId,
}: {
	parts: item[];
	status: item[];
	serialNo: string;
	originMTId: number;
	schedDetailsId: number;
}) {
	const queryClient = useQueryClient();
	const [selectedStatusId, setSelectedStatusId] = useState<string | null>(null);
	const [showRepair, setShowRepair] = useState(false);
	const [showReplacement, setShowReplacement] = useState(false);
	const [showReplace, setShowReplace] = useState(false);
	const [isQRModalOpen, setQRModalOpen] = useState(false);
	const [eSignOpen, setESignOpen] = useState(false);
	const [nozzleCheckOpen, setNozzleCheckOpen] = useState(false);
	const [selectedClient, setSelectedClient] = useState<string | null>(null);
	const [signatoryOpen, setSignatoryOpen] = useState(false);
	const [lastName, setLastName] = useState("");
	const [firstName, setFirstName] = useState("");
	const [scanned, setScanned] = useState("");
	const [callingAction, setCallingAction] = useState("");
	const [signature, setSignature] = useState<string | null>(null);
	const [signatory, setSignatory] = useState<item[]>([]);
	const IconComponent = callingAction === "Replacement" ? Replace : Wrench;
	const { users } = useUserStore();
	const [today, setToday] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
	const [objectURL, setObjectURL] = useState<string | null>(null);
	const router = useRouter();

	const { mutate: addSignatoryMutation, isPending: isAddingSignatory } =
		useMutation({
			mutationFn: async (data: {
				clientId: string;
				firstName: string;
				lastName: string;
			}) => {
				const response = await fetch(`/api/signatories`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify(data),
				});

				if (!response.ok) {
					const errorData = await response.json();
					showAppToast({
						message:
							"Failed to add signatory. Please try again later or contact support: " +
							errorData.message,
						description: "Signatory addition failed",
						position: "top-right",
						color: "error", // This will influence the default icon color and potential border
					});
				}
				return response.json();
			},
			onSuccess: () => {
				showAppToast({
					message: "New signatory has been successfully added.",
					description: "Successful addition",
					position: "top-right",
					color: "success", // This will influence the default icon color and potential border
				});

				queryClient.invalidateQueries({
					queryKey: ["signatories"],
				});
				setSelectedClient("");
				setLastName("");
				setFirstName("");
				setSignatoryOpen(false);
			},
			onError: (error) => {
				console.error("Mutation failed:", error);
			},
		});

	const {
		register,
		handleSubmit,
		control,
		setValue,
		getValues,
		formState: { errors },
	} = useForm<MaintainFormData>({
		resolver: zodResolver(maintainFormSchema),
		defaultValues: {
			printerId: 1,
			headClean: false,
			inkFlush: false,
			colorSelected: false,
			cyan: false,
			magenta: false,
			yellow: false,
			black: false,
			resetSelected: false,
			resetBox: false,
			resetProgram: false,
			status: 0,
			cleanPrinter: false,
			cleanWasteTank: false,
			replace: false,
			repair: false,
			replaceParts: [],
			repairParts: [],
			replaceUnit: false,
			replaceSerialNo: "",
			notes: "",
			userId: 32,
			signatoryId: 0,
			signPath: "",
			nozzlePath: "",
		},
	});

	const { data: clients } = useQuery<Client[]>({
		queryKey: ["clients"],
		queryFn: () => fetchData<Client[]>(`/api/clients`),
	});

	const clientsComboboxData: ComboboxItem[] = useMemo(() => {
		return (clients ?? []).map((tech) => ({
			value: tech.id,
			label: tech.name,
		}));
	}, [clients]); // Only recompute if allTechnicians array reference changes

	const refillInk = useWatch({ control, name: "colorSelected" }) ?? false;
	const reset = useWatch({ control, name: "resetSelected" }) ?? false;

	const onSubmit = async (data: MaintainFormData) => {
		setIsSaving(true); // ⛔ block UI
		if (!objectURL) {
			showAppToast({
				message: "Nozzle Check is required",
				description: "Missing nozzle check image",
				duration: 5000,
				position: "bottom-right",
				color: "warning", // This will influence the default icon color and potential border
			});
			setIsSaving(false);
			return;
		}

		const uuidSignFileName = `${uuidv4()}.png`;
		const contentType = "image/png";

		const getUrlRespSign = await fetch("/api/get-upload-url", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				key: uuidSignFileName,
				contentType: contentType,
				bucketName: "fiixdrive",
			}),
		});

		if (!getUrlRespSign.ok) {
			throw new Error("Failed to get upload URL.");
		}

		if (signature) {
			// If there is a signature, proceed to upload in cloudflare R2
			const signBlob = base64ToFile(signature!, uuidSignFileName);
			const { url } = await getUrlRespSign.json();

			const uploadResponseSign = await fetch(url, {
				method: "PUT",
				headers: { "Content-Type": contentType },
				body: signBlob,
			});

			if (!uploadResponseSign.ok) {
				// Provides better debug info on failure
				const errorText = await uploadResponseSign.text();
				throw new Error(
					`Failed to upload image to R2: ${uploadResponseSign.status}. Details: ${errorText}`
				);
			}
		}
		// END saving the signature

		// START saving the nozzle check photo
		const uuidNozzleFileName = `${uuidv4()}.png`;

		try {
			const getUrlRespNozzle = await fetch("/api/get-upload-url", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					key: uuidNozzleFileName,
					contentType: contentType,
					bucketName: "fiixnozzle",
				}),
			});

			if (!getUrlRespNozzle.ok) {
				throw new Error("Failed to get upload URL.");
			}

			const { url } = await getUrlRespNozzle.json();

			// 2. Upload the image directly to Cloudflare R2
			const uploadRespNozzle = await fetch(url, {
				method: "PUT",
				headers: { "Content-Type": contentType },
				body: capturedBlob,
			});

			if (!uploadRespNozzle.ok) {
				const errorText = await uploadRespNozzle.text();
				throw new Error(
					`Failed to upload image to R2: ${uploadRespNozzle.status}. Details: ${errorText}`
				);
			}
		} catch (error) {
			const err = ensureError(error);
			console.error("Upload error:", err);
		}
		// END saving the nozzle check photo

		data.nozzlePath = uuidNozzleFileName;
		data.signPath = signature ? uuidSignFileName : "Unsigned";
		data.userId = users.id; // Ensure userId is set correctly
		data.printerId = getValues("printerId");

		if (originMTId > 0) {
			data.originMTId = originMTId;
		}

		const res = await fetch("/api/maintain", {
			method: "POST",
			body: JSON.stringify(data),
		});
		const { id: mtId } = await res.json();

		// schedDetailsId
		const schedRes = await fetch("/api/sched-details", {
			method: "POST",
			body: JSON.stringify({ schedDetailsId, mtId }),
		});

		if (!schedRes.ok) {
			console.error("Update Schedule Details failed");
			return;
		}

		// const { success } = await schedRes.json();

		setIsSaving(false);

		showAppToast({
			message: "The maintenance record has been successfully saved.",
			description: "Successful save",
			duration: 5000,
			position: "top-center",
			color: "success",
		});
		router.push("/dashboard");
	};

	const handleCustomSubmit = async (e: React.MouseEvent<HTMLButtonElement>) => {
		e.preventDefault(); // ⛔ Prevent default form submission behavior

		const { client } = getValues();

		if (!client?.label || !client?.value) {
			showAppToast({
				message: "Please scan the QR code of the unit first.",
				description: "Missed QR code scan",
				duration: 5000,
				position: "bottom-right",
				color: "warning",
			});

			return;
		}

		// If client is valid, trigger normal validation and submission
		await handleSubmit(onSubmit, (errors) => {
			console.log("❌ FORM ERRORS", errors);
		})(/* no event object needed here */);
	};

	useEffect(() => {
		setValue("replaceSerialNo", scanned);
	}, [scanned, setValue]);

	useEffect(() => {
		setValue("signPath", signature || "");
	}, [signature, setValue]);

	useEffect(() => {
		const formatted = format(new Date(), "yyyy-MM-dd"); // "YYYY-MM-DD"
		setToday(formatted);
		setValue("serialNo", serialNo);
		onHandleScan(serialNo);
	}, [setToday, setValue, serialNo]);

	// 🔁 Update checkbox when status changes
	useEffect(() => {
		if (selectedStatusId === "4") {
			// Pulled Out
			setShowReplace(true);
			setValue("replaceUnit", true);
		} else {
			setShowReplace(false);
			setValue("replaceUnit", false);
		}
	}, [selectedStatusId, setValue]);

	// Add cleanup in a useEffect hook for unmount safety
	useEffect(() => {
		return () => {
			if (objectURL) {
				URL.revokeObjectURL(objectURL);
			}
			setValue("nozzlePath", objectURL || "");
		};
	}, [objectURL, setValue]);

	const onHandleScan = async (scannedSerialNo: string) => {
		if (callingAction === "Replacement") {
			setScanned(scannedSerialNo);
		} else {
			try {
				const res = await fetch(`/api/maintain?serialNo=${scannedSerialNo}`);
				const { maintenanceData, signatories, error } = await res.json();

				if (error === "Duplicate") {
					showAppToast({
						message: "Duplicate serial number not allowed",
						description: "Record duplicate",
						duration: 5000,
						position: "top-center",
						color: "error", // This will influence the default icon color and potential border
					});

					return;
				}

				if (!res.ok || !maintenanceData) {
					if (originMTId !== 0) {
						showAppToast({
							message: "No matching record found in the database.",
							description: "Record not found",
							duration: 5000,
							position: "top-center",
							color: "error", // This will influence the default icon color and potential border
						});
					}
					return;
				}

				setValue("client", {
					value: maintenanceData.clientId,
					label: maintenanceData.client,
				});
				setValue("location", {
					value: maintenanceData.locationId,
					label: maintenanceData.location,
				});
				setValue("department", {
					value: maintenanceData.departmentId,
					label: maintenanceData.department,
				});
				setValue("model", {
					value: maintenanceData.modelId,
					label: maintenanceData.model,
				});
				setValue("serialNo", maintenanceData.serialNo);
				setValue("replaceSerialNo", maintenanceData.replaceSerialNo || "");
				setValue("printerId", maintenanceData.id);
				// Do something with `data` (e.g. update Zustand, UI, etc.)

				setSignatory(signatories);
			} catch (err) {
				showAppToast({
					message: "An error exist on scanning the serial no. " + err,
					description: "Scan error",
					position: "top-center",
					color: "error", // This will influence the default icon color and potential border
				});
			}
		}
	};

	const handleSignatory = () => {
		// Basic validation to ensure all fields are filled
		if (!selectedClient || !lastName || !firstName) {
			alert("Please fill out all fields.");
			return;
		}

		addSignatoryMutation({
			clientId: selectedClient,
			firstName,
			lastName,
		});

		// Reset state and close the dialog
		setSelectedClient("");
		setLastName("");
		setFirstName("");
		setSignatoryOpen(false);
	};

	const handleCapture = (blob: Blob) => {
		setCapturedBlob(blob);

		// Create the temporary URL immediately after capture
		const url = URL.createObjectURL(blob);
		setObjectURL(url);
	};

	// This is the function passed to onRetake
	const handleRetake = () => {
		setCapturedBlob(null); // Resets the state, triggering CameraCapture to restart the stream
		setObjectURL(null);
	};

	return (
		<div className="lg:p-6 max-w-full mx-auto space-y-4">
			<div className="lg:p-6 max-w-full mx-auto">
				<form className="space-y-4">
					<div className="rounded-2xl grid grid-cols-1 gap-4 p-[1px] bg-gradient-to-r from-red-400 via-green-500 to-blue-400">
						<Card className="rounded-2xl bg-white dark:bg-black">
							<CardContent className="p-6 space-y-4">
								<div className="grid lg:grid-cols-3 grid-cols-1 gap-4">
									<div className="space-y-1">
										<Label>Client Name</Label>
										<Input
											placeholder="Enter client name"
											{...register("client.label")}
											disabled
										/>
										<input
											type="hidden"
											{...register("client.value", { valueAsNumber: true })}
										/>
									</div>
									<div className="space-y-1">
										<Label>Location</Label>
										<Input
											placeholder="Enter location"
											{...register("location.label")}
											disabled
										/>
										<input
											type="hidden"
											{...register("location.value", { valueAsNumber: true })}
											disabled
										/>
									</div>
									<div className="space-y-1">
										<Label>Department</Label>
										<Input
											placeholder="Enter department name"
											{...register("department.label")}
											disabled
										/>
										<input
											type="hidden"
											{...register("department.value", { valueAsNumber: true })}
										/>
									</div>
								</div>
								<div className="grid lg:grid-cols-3 grid-cols-1 gap-4">
									<div className="space-y-1">
										<Label>Epson Printer Model</Label>
										<Input
											placeholder="e.g. WFC5790"
											{...register("model.label")}
											disabled
										/>
									</div>
									<div className="space-y-1">
										<Label>Serial Number</Label>
										<Input
											placeholder="e.g. X3BC007142"
											{...register("serialNo")}
											disabled
										/>
									</div>
									<div className="space-y-1">
										<Label>Date / Time</Label>
										<Input
											type="date"
											value={today}
											onChange={(e) => setToday(e.target.value)}
											disabled
										/>
									</div>
								</div>

								<hr className="my-5" />
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									<div className="space-y-2">
										<Label>Work Done</Label>
										<div className="space-y-2">
											<div className="flex items-center space-x-2">
												<Controller
													name="headClean"
													control={control}
													defaultValue={false}
													render={({ field }) => (
														<Checkbox
															id="headClean"
															checked={field.value}
															onCheckedChange={(checked) => {
																field.onChange(checked);
															}}
														/>
													)}
												/>
												<Label
													htmlFor="headClean"
													className="font-normal text-md"
												>
													Head Clean
												</Label>
											</div>
											<div className="flex items-center space-x-2">
												<Controller
													name="inkFlush"
													control={control}
													defaultValue={false}
													render={({ field }) => (
														<Checkbox
															id="inkFlush"
															checked={field.value}
															onCheckedChange={(checked) => {
																field.onChange(checked);
															}}
														/>
													)}
												/>
												<Label
													htmlFor="inkFlush"
													className="font-normal text-md"
												>
													Ink Flushing
												</Label>
											</div>
											<div className="flex items-center space-x-2">
												<Controller
													name="colorSelected"
													control={control}
													defaultValue={false}
													render={({ field }) => (
														<Checkbox
															id="color-group"
															checked={field.value}
															onCheckedChange={(checked) => {
																field.onChange(checked);
															}}
														/>
													)}
												/>
												<Label
													htmlFor="color-group"
													className="font-normal text-md"
												>
													Refill Ink [C] [M] [Y] [K]
												</Label>
											</div>
											<div className="ml-6 mt-2 grid grid-cols-4 gap-2 max-w-xs">
												<div className="flex items-center space-x-1">
													<Controller
														name="cyan"
														control={control}
														defaultValue={false}
														render={({ field }) => (
															<Checkbox
																id="cyan"
																checked={field.value}
																onCheckedChange={(checked) => {
																	field.onChange(checked);
																}}
																disabled={!refillInk}
															/>
														)}
													/>

													<Label htmlFor="cyan" className="font-normal text-md">
														C
													</Label>
												</div>
												<div className="flex items-center space-x-1">
													<Controller
														name="magenta"
														control={control}
														defaultValue={false}
														render={({ field }) => (
															<Checkbox
																id="magenta"
																checked={field.value}
																onCheckedChange={(checked) => {
																	field.onChange(checked);
																}}
																disabled={!refillInk}
															/>
														)}
													/>
													<Label
														htmlFor="magenta"
														className="font-normal text-md"
													>
														M
													</Label>
												</div>
												<div className="flex items-center space-x-1">
													<Controller
														name="yellow"
														control={control}
														defaultValue={false}
														render={({ field }) => (
															<Checkbox
																id="yellow"
																checked={field.value}
																onCheckedChange={(checked) => {
																	field.onChange(checked);
																}}
																disabled={!refillInk}
															/>
														)}
													/>
													<Label
														htmlFor="yellow"
														className="font-normal text-md"
													>
														Y
													</Label>
												</div>
												<div className="flex items-center space-x-1">
													<Controller
														name="black"
														control={control}
														defaultValue={false}
														render={({ field }) => (
															<Checkbox
																id="black"
																checked={field.value}
																onCheckedChange={(checked) => {
																	field.onChange(checked);
																}}
																disabled={!refillInk}
															/>
														)}
													/>
													<Label
														htmlFor="black"
														className="font-normal text-md"
													>
														K
													</Label>
												</div>
											</div>
											{errors.colorGroup?.message && (
												<p className="text-red-600 text-sm">
													{errors.colorGroup.message}
												</p>
											)}
											<div className="flex items-center space-x-2">
												<Controller
													name="resetSelected"
													control={control}
													defaultValue={false}
													render={({ field }) => (
														<Checkbox
															id="reset-box"
															checked={field.value}
															onCheckedChange={(checked) => {
																field.onChange(checked);
															}}
														/>
													)}
												/>

												<Label
													htmlFor="reset-box"
													className="font-normal text-md"
												>
													Reset [Box] [Program]
												</Label>
											</div>
											<div className="ml-6 mt-2 grid grid-cols-4 gap-2 max-w-xs">
												<div className="flex items-center space-x-1">
													<Controller
														name="resetBox"
														control={control}
														defaultValue={false}
														render={({ field }) => (
															<Checkbox
																id="resetBox"
																checked={field.value}
																onCheckedChange={(checked) => {
																	field.onChange(checked);
																}}
																disabled={!reset}
															/>
														)}
													/>
													<Label
														htmlFor="resetBox"
														className="font-normal text-md"
													>
														Box
													</Label>
												</div>
												<div className="flex items-center space-x-1">
													<Controller
														name="resetProgram"
														control={control}
														defaultValue={false}
														render={({ field }) => (
															<Checkbox
																id="resetProgram"
																checked={field.value}
																onCheckedChange={(checked) => {
																	field.onChange(checked);
																}}
																disabled={!reset}
															/>
														)}
													/>
													<Label
														htmlFor="resetProgram"
														className="font-normal text-md"
													>
														Program
													</Label>
												</div>
											</div>
										</div>
										{errors.resetGroup?.message && (
											<p className="text-red-600 text-sm">
												{errors.resetGroup.message}
											</p>
										)}
										<Label>Printer Status</Label>
										<div className="space-y-2 ">
											<div className="flex items-center space-x-2">
												<Controller
													name="status"
													control={control}
													render={({ field }) => (
														<>
															<ComboBoxResponsive
																data={status}
																placeholder="Status"
																selectedValue={
																	field.value ? String(field.value) : null
																}
																onValueChange={(selectedId) => {
																	setSelectedStatusId(selectedId);
																	field.onChange(
																		selectedId ? Number(selectedId) : 0
																	);
																}}
																emptyMessage="No status found."
															/>
														</>
													)}
												/>
											</div>
										</div>
										{errors.status && (
											<p className="text-sm text-red-500">
												{errors.status.message}
											</p>
										)}
									</div>

									<div className="space-y-2">
										<Label>Services</Label>
										<div className="space-y-2">
											<div className="flex items-center space-x-2">
												<Controller
													name="cleanPrinter"
													control={control}
													defaultValue={false}
													render={({ field }) => (
														<Checkbox
															id="cleanPrinter"
															checked={field.value}
															onCheckedChange={(checked) => {
																field.onChange(checked);
															}}
														/>
													)}
												/>
												<Label
													htmlFor="cleanPrinter"
													className="font-normal text-md"
												>
													Cleaning of Printer
												</Label>
											</div>
											<div className="flex items-center space-x-2">
												<Controller
													name="cleanWasteTank"
													control={control}
													defaultValue={false}
													render={({ field }) => (
														<Checkbox
															id="cleanWasteTank"
															checked={field.value}
															onCheckedChange={(checked) => {
																field.onChange(checked);
															}}
														/>
													)}
												/>
												<Label
													htmlFor="cleanWasteTank"
													className="font-normal text-md"
												>
													Cleaning of Waste Tank
												</Label>
											</div>
											<div className="flex items-center space-x-2">
												<Controller
													name="replace"
													control={control}
													defaultValue={false}
													render={({ field }) => (
														<Checkbox
															id="replace"
															checked={field.value}
															onCheckedChange={(checked) => {
																field.onChange(checked);
																setShowReplacement(!!checked);
															}}
														/>
													)}
												/>

												<Label
													htmlFor="replace"
													className="font-normal text-md"
												>
													Replacement
												</Label>
											</div>
											{showReplacement && (
												<Controller
													name="replaceParts"
													control={control}
													render={({ field }) => (
														<Select<item, true>
															closeMenuOnSelect={false}
															isMulti
															value={
																field.value?.map((part) => ({
																	label: part.partName ?? "",
																	value: part.partId ?? "",
																})) || []
															}
															onChange={(selectedOptions) => {
																field.onChange(
																	selectedOptions.map((option) => ({
																		partId: option.value,
																		partName: option.label,
																	}))
																);
															}}
															options={parts} // your item[] array
															placeholder="Replacement (please indicate the parts)"
															getOptionValue={(option) => option.value}
															getOptionLabel={(option) => option.label}
														/>
													)}
												/>
											)}
											{errors.replaceParts?.message && (
												<p className="text-red-600 text-sm">
													{errors.replaceParts.message}
												</p>
											)}
											<div className="flex items-center space-x-2">
												<Controller
													name="repair"
													control={control}
													defaultValue={false}
													render={({ field }) => (
														<Checkbox
															id="repair"
															checked={field.value}
															onCheckedChange={(checked) => {
																field.onChange(checked);
																setShowRepair(!!checked);
															}}
														/>
													)}
												/>
												<Label htmlFor="repair" className="font-normal text-md">
													Repair
												</Label>
											</div>
											{showRepair && (
												<Controller
													name="repairParts"
													control={control}
													render={({ field }) => (
														<Select<item, true>
															closeMenuOnSelect={false}
															isMulti
															value={
																field.value?.map((part) => ({
																	label: part.partName ?? "",
																	value: part.partId ?? "",
																})) || []
															}
															onChange={(selectedOptions) => {
																field.onChange(
																	selectedOptions.map((option) => ({
																		partId: option.value,
																		partName: option.label,
																	}))
																);
															}}
															options={parts} // your item[] array
															placeholder="Repair (please indicate the parts)"
															getOptionValue={(option) => option.value}
															getOptionLabel={(option) => option.label}
														/>
													)}
												/>
											)}
											{errors.repairParts?.message && (
												<p className="text-red-600 text-sm">
													{errors.repairParts.message}
												</p>
											)}
											<div className="flex items-center space-x-2">
												<Controller
													name="replaceUnit"
													control={control}
													defaultValue={false}
													render={({ field }) => (
														<Checkbox
															id="replaceUnit"
															disabled
															checked={field.value}
															onCheckedChange={(checked) => {
																field.onChange(checked);
																setShowReplace(!!checked);
															}}
														/>
													)}
												/>

												<Label
													htmlFor="replaceUnit"
													className="font-normal text-md"
												>
													Replace Service Unit
												</Label>
												{showReplace && (
													<button
														type="button"
														onClick={() => {
															setQRModalOpen(true);
															setCallingAction("Replacement");
														}}
														className="ml-1 p-1 bg-blue-600 hover:bg-blue-700 rounded-full text-white"
														title="Scan QR Code"
													>
														<QrCode className="w-5 h-5" />
													</button>
												)}
												{showReplace && (
													<Controller
														name="replaceSerialNo"
														control={control}
														render={({ field }) => (
															<>
																{scanned && (
																	<Label className="text-green-600">
																		{scanned}
																	</Label>
																)}
																<input
																	type="hidden"
																	value={scanned}
																	onChange={field.onChange}
																/>
															</>
														)}
													/>
												)}
											</div>
											{errors.replaceSerialNo && (
												<p className="text-red-500 text-sm">
													{errors.replaceSerialNo.message}
												</p>
											)}

											<div>
												<Textarea
													id="notes"
													placeholder="Leave a note here"
													{...register("notes")}
												/>
											</div>
										</div>
									</div>
								</div>

								<hr className="my-5" />

								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									<div className="space-y-1">
										<Label>Prepared By</Label>
										<Input
											placeholder="Technician name"
											value={users.firstName + " " + users.lastName}
											disabled
										/>
									</div>
									<div className="space-y-1">
										<Label>Checked By</Label>
										<div className="flex items-center gap-2">
											<div className="flex-grow">
												{" "}
												{/* Added a new div for the ComboBox to grow */}
												<Controller
													name="signatoryId"
													control={control}
													render={({ field }) => (
														<ComboBoxResponsive
															data={signatory}
															placeholder="Signatory"
															selectedValue={
																field.value ? String(field.value) : null
															}
															onValueChange={(selectedId) => {
																field.onChange(
																	selectedId ? Number(selectedId) : 0
																);
															}}
															emptyMessage="No signatories found"
														/>
													)}
												/>
											</div>

											<Button
												type="button"
												variant={"secondary"}
												onClick={() => {
													setSignatoryOpen(true);
												}}
												className="p-1 rounded-full"
											>
												<PlusIcon className="w-5 h-5" />
											</Button>
										</div>
										{/* Error messages */}
										{errors.signatoryId && (
											<p className="text-sm text-red-500">
												{errors.signatoryId.message}
											</p>
										)}
										{errors.signPath && (
											<p className="text-sm text-red-500">
												{errors.signPath.message}
											</p>
										)}
									</div>
								</div>
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									<div
										className="space-y-1 order-2 md:order-1"
										id="NozzleCheck"
									>
										<div className="flex items-start space-x-2">
											<Button
												type="button"
												variant={"secondary"}
												onClick={() => {
													setNozzleCheckOpen(true);
												}}
												className="ml-1 p-1 rounded-full"
											>
												<CheckIcon className="w-5 h-5" />
											</Button>
											{capturedBlob && objectURL && (
												<div className="flex flex-col items-start">
													<Image
														src={objectURL}
														alt="Nozzle Check"
														className="border rounded-md max-w-xs"
														height={120}
														width={250}
													/>
												</div>
											)}
											<Controller
												name="nozzlePath"
												control={control}
												render={({ field }) => (
													<input
														type="hidden"
														value={objectURL || ""}
														onChange={field.onChange}
													/>
												)}
											/>
										</div>
									</div>
									<div
										className="space-y-1 order-1 md:order-2"
										id="SignaturePad"
									>
										<div className="flex items-start space-x-2">
											<Button
												type="button"
												variant={"secondary"}
												onClick={() => {
													setESignOpen(true);
												}}
												className="ml-1 p-1 rounded-full"
											>
												<Signature className="w-5 h-5" />
											</Button>
											{signature && (
												<div className="flex flex-col items-start">
													<Image
														src={signature}
														alt="Signature"
														className="border rounded-md max-w-xs"
														height={120}
														width={250}
													/>
												</div>
											)}
											<Controller
												name="signPath"
												control={control}
												render={({ field }) => (
													<input
														type="hidden"
														value={signature ?? ""}
														onChange={field.onChange}
													/>
												)}
											/>
										</div>
									</div>
								</div>
								<div className="grid grid-cols-1 md:gridcols-2 gap-4">
									<div className="space-y-1 order-2 md:order-1" id="SaveButton">
										<Button
											variant="default"
											type="submit"
											onClick={handleCustomSubmit}
											disabled={isSaving}
										>
											{isSaving ? "Saving Maintenance..." : "Save Maintenance"}
										</Button>
									</div>
								</div>
							</CardContent>
						</Card>
					</div>
				</form>
			</div>
			{/* Floating QR Button */}
			<button
				onClick={() => {
					setQRModalOpen(true);
					setCallingAction("Maintenance");
				}}
				className="fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg z-50"
			>
				<QrCode className="w-6 h-6" />
			</button>
			<Dialog open={isQRModalOpen} onOpenChange={setQRModalOpen}>
				<DialogContent className="max-w-2xl max-h-2xl overflow-auto">
					<DialogHeader>
						<DialogTitle>
							<div
								className="flex items-center justify-between p-4 bg-gray-100 border-b"
								hidden
							>
								<h1 className="text-xl font-semibold">
									QR Code Scanner for {callingAction}
								</h1>
								<IconComponent className="w-8 h-8 text-green-400" />
							</div>
						</DialogTitle>
					</DialogHeader>
					{typeof window !== "undefined" ? (
						<ScanQRCodeModalContent
							callingPage={callingAction}
							onScan={(value) => {
								onHandleScan(value);
							}}
							onClose={() => setQRModalOpen(false)}
						/>
					) : (
						<p>Loading QR Scanner...</p>
					)}
				</DialogContent>
			</Dialog>
			<Dialog open={eSignOpen} onOpenChange={setESignOpen}>
				<DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
					<DialogHeader>
						<DialogTitle>
							<div className="flex items-center justify-between p-4 bg-gray-100 border-b mt-2">
								<h1 className="text-xl font-semibold">Signatory</h1>
								<Signature className="w-8 h-8 text-green-400" />
							</div>
						</DialogTitle>
					</DialogHeader>
					<div>
						{typeof window !== "undefined" ? (
							<SignaturePad onSave={(sig) => setSignature(sig)} />
						) : (
							<p>Loading Signature Pad...</p>
						)}
					</div>
				</DialogContent>
			</Dialog>
			<Dialog open={nozzleCheckOpen} onOpenChange={setNozzleCheckOpen}>
				<DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
					<DialogHeader>
						<DialogTitle>
							<div className="flex items-center justify-between p-4 bg-gray-100 border-b mt-2">
								<h1 className="text-xl font-semibold">Upload Nozzle Check</h1>
								<CheckIcon className="w-8 h-8 text-green-400" />
							</div>
						</DialogTitle>
					</DialogHeader>
					<div>
						{typeof window !== "undefined" ? (
							<CameraCapture
								onCapture={handleCapture}
								onRetake={handleRetake}
								capturedBlob={capturedBlob}
								onClose={() => setNozzleCheckOpen(false)}
							/>
						) : (
							<p>Loading camera capture...</p>
						)}
					</div>
				</DialogContent>
			</Dialog>
			<Dialog open={signatoryOpen} onOpenChange={setSignatoryOpen}>
				<DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
					<DialogHeader>
						<DialogTitle>
							<div className="flex items-center justify-between p-4 bg-gray-100 border-b mt-2">
								<h1 className="text-xl font-semibold">Add Signatories</h1>
								<PlusIcon className="w-8 h-8 text-green-400" />
							</div>
						</DialogTitle>
					</DialogHeader>
					<div className="grid gap-4 py-4">
						{/* ComboBox for Client Selection */}
						<div className="space-y-2">
							<Label htmlFor="client">Client:</Label>
							<ComboBoxResponsive
								data={clientsComboboxData}
								placeholder="Client"
								selectedValue={selectedClient}
								onValueChange={setSelectedClient}
								emptyMessage="No client found."
							/>
						</div>

						{/* Last Name Input */}
						<div className="space-y-2">
							<Label htmlFor="lastName" className="text-right">
								Last Name:
							</Label>
							<Input
								id="lastName"
								value={lastName}
								onChange={(e) => setLastName(e.target.value)}
								className="col-span-3"
							/>
						</div>

						{/* First Name Input */}
						<div className="space-y-2">
							<Label htmlFor="firstName" className="text-right">
								First Name:
							</Label>
							<Input
								id="firstName"
								value={firstName}
								onChange={(e) => setFirstName(e.target.value)}
								className="col-span-3"
							/>
						</div>
					</div>
					<DialogFooter>
						<Button
							type="submit"
							onClick={handleSignatory}
							disabled={isAddingSignatory}
						>
							{isAddingSignatory ? "Saving..." : "Save"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<Dialog open={isSaving}>
				<DialogContent className="max-w-sm p-6 flex flex-col items-center justify-center text-center">
					<DialogHeader>
						<DialogTitle className="text-lg font-medium">Saving...</DialogTitle>
					</DialogHeader>
					<Loader2 className="h-6 w-6 animate-spin text-blue-600 my-4" />
					<p className="text-gray-500 text-sm">
						Please wait while we save your data.
					</p>
				</DialogContent>
			</Dialog>
		</div>
	);
}
