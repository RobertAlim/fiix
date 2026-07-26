"use client";

import React, { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	UploadCloud,
	CheckCircle2,
	AlertTriangle,
	XCircle,
	Loader2,
} from "lucide-react";
import { showAppToast } from "@/components/ui/apptoast";

interface ImportRowError {
	row: number;
	message: string;
}

interface ImportResult {
	imported: number;
	skipped: number;
	failed: number;
	errors: ImportRowError[];
}

interface ImportCsvCardProps {
	title: string;
	description: string;
	endpoint: string;
	expectedColumns: string[];
}

export function ImportCsvCard({
	title,
	description,
	endpoint,
	expectedColumns,
}: ImportCsvCardProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isUploading, setIsUploading] = useState(false);
	const [result, setResult] = useState<ImportResult | null>(null);
	const [fileName, setFileName] = useState<string | null>(null);

	const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = ""; // allow re-selecting the same file later
		if (!file) return;

		if (!file.name.toLowerCase().endsWith(".csv")) {
			showAppToast({
				message: "Invalid file type",
				description: "Only .csv files are accepted.",
				position: "top-right",
				color: "error",
			});
			return;
		}

		setFileName(file.name);
		setResult(null);
		setIsUploading(true);

		try {
			const csvText = await file.text();
			const res = await fetch(endpoint, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ csv: csvText }),
			});

			const data = await res.json();

			if (!res.ok) {
				showAppToast({
					message: "Import failed",
					description: data.error || "The file could not be imported.",
					position: "top-right",
					color: "error",
				});
				setIsUploading(false);
				return;
			}

			setResult(data as ImportResult);
			showAppToast({
				message: "Import complete",
				description: `${data.imported} imported, ${data.skipped} skipped, ${data.failed} failed.`,
				position: "top-right",
				color: data.failed > 0 ? "warning" : "success",
			});
		} catch (err) {
			showAppToast({
				message: "Import failed",
				description: err instanceof Error ? err.message : "Unexpected error.",
				position: "top-right",
				color: "error",
			});
		} finally {
			setIsUploading(false);
		}
	};

	return (
		<Card className="rounded-xl border shadow-none">
			<CardHeader className="pb-2">
				<CardTitle className="text-sm font-semibold">{title}</CardTitle>
				<p className="text-xs text-muted-foreground">{description}</p>
			</CardHeader>
			<CardContent className="space-y-3">
				<p className="text-xs text-muted-foreground">
					Expected columns:{" "}
					<span className="font-mono">{expectedColumns.join(", ")}</span>
				</p>

				<input
					ref={fileInputRef}
					type="file"
					accept=".csv"
					className="hidden"
					onChange={handleFileChange}
				/>
				<Button
					variant="outline"
					size="sm"
					className="w-full"
					disabled={isUploading}
					onClick={() => fileInputRef.current?.click()}
				>
					{isUploading ? (
						<Loader2 className="h-4 w-4 animate-spin" />
					) : (
						<UploadCloud className="h-4 w-4" />
					)}
					{isUploading ? "Importing…" : "Upload CSV"}
				</Button>

				{fileName && !isUploading && (
					<p className="truncate text-xs text-muted-foreground">{fileName}</p>
				)}

				{result && (
					<div className="space-y-2 rounded-lg bg-muted p-3">
						<div className="flex flex-wrap gap-2">
							<Badge className="gap-1 bg-success text-success-foreground">
								<CheckCircle2 className="h-3 w-3" />
								{result.imported} imported
							</Badge>
							{result.skipped > 0 && (
								<Badge className="gap-1 bg-warning text-warning-foreground">
									<AlertTriangle className="h-3 w-3" />
									{result.skipped} skipped
								</Badge>
							)}
							{result.failed > 0 && (
								<Badge variant="destructive" className="gap-1">
									<XCircle className="h-3 w-3" />
									{result.failed} failed
								</Badge>
							)}
						</div>

						{result.errors.length > 0 && (
							<div className="max-h-40 overflow-y-auto rounded-md border bg-card p-2">
								<ul className="space-y-1 text-xs text-muted-foreground">
									{result.errors.map((e, i) => (
										<li key={i}>
											<span className="font-medium text-foreground">
												Row {e.row}:
											</span>{" "}
											{e.message}
										</li>
									))}
								</ul>
							</div>
						)}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
