"use client";

import React from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { MasterDataManager } from "@/components/MasterDataManager";
import { ImportCsvModalButton } from "@/components/ImportCsvModalButton";
import { DatabaseZap } from "lucide-react";

export default function DataImportPage() {
	return (
		<div className="space-y-6">
			<Card className="rounded-2xl border shadow-sm">
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base font-semibold">
						<DatabaseZap className="h-5 w-5 text-primary" />
						Master Data
					</CardTitle>
					<p className="text-sm text-muted-foreground">
						Manage master data individually below, or bulk-import via CSV.
						Each module is independent — invalid or duplicate records are
						rejected with a clear reason either way. Click a section to
						expand or collapse it.
					</p>
				</CardHeader>
			</Card>

			<Card className="rounded-2xl border shadow-sm">
				<Accordion type="multiple" className="px-6">
					{/* Clients */}
					<AccordionItem value="clients">
						<AccordionTrigger>Clients</AccordionTrigger>
						<AccordionContent>
							<MasterDataManager
								title="Clients"
								listEndpoint="/api/admin/master/clients"
								itemEndpoint={(id) => `/api/admin/master/clients/${id}`}
								columns={[{ key: "name", label: "Name" }]}
								fields={[{ name: "name", label: "Name", type: "text", required: true }]}
								displayName={(row) => String(row.name)}
								headerExtra={
									<ImportCsvModalButton
										tableName="Clients"
										description="Bulk-import client accounts."
										endpoint="/api/admin/import/clients"
										expectedColumns={["name"]}
									/>
								}
							/>
						</AccordionContent>
					</AccordionItem>

					{/* Departments */}
					<AccordionItem value="departments">
						<AccordionTrigger>Departments</AccordionTrigger>
						<AccordionContent>
							<MasterDataManager
								title="Departments"
								listEndpoint="/api/admin/master/departments"
								itemEndpoint={(id) => `/api/admin/master/departments/${id}`}
								columns={[{ key: "name", label: "Name" }]}
								fields={[{ name: "name", label: "Name", type: "text", required: true }]}
								displayName={(row) => String(row.name)}
								headerExtra={
									<ImportCsvModalButton
										tableName="Departments"
										description="Bulk-import departments."
										endpoint="/api/admin/import/departments"
										expectedColumns={["name"]}
									/>
								}
							/>
						</AccordionContent>
					</AccordionItem>

					{/* Locations */}
					<AccordionItem value="locations">
						<AccordionTrigger>Locations</AccordionTrigger>
						<AccordionContent>
							<MasterDataManager
								title="Locations"
								listEndpoint="/api/admin/master/locations"
								itemEndpoint={(id) => `/api/admin/master/locations/${id}`}
								columns={[
									{ key: "name", label: "Name" },
									{ key: "clientName", label: "Client" },
								]}
								fields={[
									{ name: "name", label: "Name", type: "text", required: true },
									{
										name: "clientId",
										label: "Client",
										type: "select",
										required: true,
										optionsEndpoint: "/api/admin/master/clients",
										optionsQueryKey: ["/api/admin/master/clients"],
									},
								]}
								displayName={(row) => `${row.name} (${row.clientName})`}
								headerExtra={
									<ImportCsvModalButton
										tableName="Locations"
										description="Locations belong to a client — import clients first."
										endpoint="/api/admin/import/locations"
										expectedColumns={["name", "client"]}
									/>
								}
							/>
						</AccordionContent>
					</AccordionItem>

					{/* Models */}
					<AccordionItem value="models">
						<AccordionTrigger>Models</AccordionTrigger>
						<AccordionContent>
							<MasterDataManager
								title="Models"
								listEndpoint="/api/admin/master/models"
								itemEndpoint={(id) => `/api/admin/master/models/${id}`}
								columns={[{ key: "name", label: "Name" }]}
								fields={[{ name: "name", label: "Name", type: "text", required: true }]}
								displayName={(row) => String(row.name)}
								headerExtra={
									<ImportCsvModalButton
										tableName="Models"
										description="Bulk-import printer models."
										endpoint="/api/admin/import/models"
										expectedColumns={["name"]}
									/>
								}
							/>
						</AccordionContent>
					</AccordionItem>

					{/* Parts */}
					<AccordionItem value="parts">
						<AccordionTrigger>Parts</AccordionTrigger>
						<AccordionContent>
							<MasterDataManager
								title="Parts"
								listEndpoint="/api/admin/master/parts"
								itemEndpoint={(id) => `/api/admin/master/parts/${id}`}
								columns={[{ key: "name", label: "Name" }]}
								fields={[{ name: "name", label: "Name", type: "text", required: true }]}
								displayName={(row) => String(row.name)}
								headerExtra={
									<ImportCsvModalButton
										tableName="Parts"
										description="Bulk-import printer parts."
										endpoint="/api/admin/import/parts"
										expectedColumns={["name"]}
									/>
								}
							/>
						</AccordionContent>
					</AccordionItem>

					{/* Signatories */}
					<AccordionItem value="signatories">
						<AccordionTrigger>Signatories</AccordionTrigger>
						<AccordionContent>
							<MasterDataManager
								title="Signatories"
								listEndpoint="/api/admin/master/signatories"
								itemEndpoint={(id) => `/api/admin/master/signatories/${id}`}
								columns={[
									{ key: "firstName", label: "First Name" },
									{ key: "lastName", label: "Last Name" },
									{ key: "clientName", label: "Client", render: (r) => (r.clientName ? String(r.clientName) : "—") },
								]}
								fields={[
									{ name: "firstName", label: "First Name", type: "text", required: true },
									{ name: "lastName", label: "Last Name", type: "text", required: true },
									{
										name: "clientId",
										label: "Client (optional)",
										type: "select",
										optionsEndpoint: "/api/admin/master/clients",
										optionsQueryKey: ["/api/admin/master/clients"],
									},
								]}
								displayName={(row) => `${row.firstName} ${row.lastName}`}
								headerExtra={
									<ImportCsvModalButton
										tableName="Signatories"
										description="Client is optional — leave blank if not tied to one."
										endpoint="/api/admin/import/signatories"
										expectedColumns={["firstName", "lastName", "client (optional)"]}
									/>
								}
							/>
						</AccordionContent>
					</AccordionItem>

					{/* Priorities */}
					<AccordionItem value="priorities">
						<AccordionTrigger>Priorities</AccordionTrigger>
						<AccordionContent>
							<MasterDataManager
								title="Priorities"
								listEndpoint="/api/admin/master/priorities"
								itemEndpoint={(id) => `/api/admin/master/priorities/${id}`}
								columns={[
									{ key: "id", label: "ID" },
									{ key: "name", label: "Name" },
								]}
								fields={[
									{ name: "id", label: "ID", type: "number", required: true, immutable: true },
									{ name: "name", label: "Name", type: "text", required: true },
								]}
								displayName={(row) => String(row.name)}
								headerExtra={
									<ImportCsvModalButton
										tableName="Priorities"
										description="Priorities use a manually-assigned id — both id and name are required."
										endpoint="/api/admin/import/priorities"
										expectedColumns={["id", "name"]}
									/>
								}
							/>
						</AccordionContent>
					</AccordionItem>
				</Accordion>
			</Card>
		</div>
	);
}
