"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { ImportCsvCard } from "@/components/ImportCsvCard";
import { UploadCloud } from "lucide-react";

interface ImportCsvModalButtonProps {
	tableName: string;
	description: string;
	endpoint: string;
	expectedColumns: string[];
}

export function ImportCsvModalButton({
	tableName,
	description,
	endpoint,
	expectedColumns,
}: ImportCsvModalButtonProps) {
	const [open, setOpen] = useState(false);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<Button size="sm" variant="outline" onClick={() => setOpen(true)}>
				<UploadCloud className="h-4 w-4" />
				Import {tableName}
			</Button>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Import {tableName}</DialogTitle>
				</DialogHeader>
				<ImportCsvCard
					title={`Import ${tableName}`}
					description={description}
					endpoint={endpoint}
					expectedColumns={expectedColumns}
				/>
			</DialogContent>
		</Dialog>
	);
}
