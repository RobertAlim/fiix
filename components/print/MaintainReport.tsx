// components/MyDocument.tsx
export const runtime = "nodejs"; // Ensure it's not using Edge runtime
import React from "react";
import fs from "fs";
import path from "path";
import {
	Document,
	Page,
	Text,
	View,
	StyleSheet,
	Image,
} from "@react-pdf/renderer";

// Load image from disk as a Buffer
const logoPath = path.join(process.cwd(), "public/assets/FRUITBEAN.png");
const logoBuffer = fs.readFileSync(logoPath);
const styles = StyleSheet.create({
	page: {
		paddingTop: 5,
		paddingHorizontal: 20,
		fontSize: 10,
		fontFamily: "Helvetica",
	},
	section: {
		marginBottom: 10,
	},
	row: {
		display: "flex",
		flexDirection: "row",
		gap: 10,
		marginBottom: 5,
	},
	column: {
		flex: 1,
	},
	item: {
		display: "flex",
		flexDirection: "row",
		width: "100%",
	},
	label: {
		fontWeight: "bold",
	},
	checkboxGroup: {
		display: "flex",
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 5,
		marginTop: 5,
		alignItems: "center",
	},
	footer: {
		display: "flex",
		flexDirection: "row",
		marginTop: 10,
		borderTopWidth: 1,
		paddingTop: 5,
	},
	signBox: {
		flex: 1,
	},
	heading: {
		fontSize: 12,
		marginBottom: 10,
		textAlign: "center",
		fontWeight: "bold",
	},
	logo: {
		width: 100,
		height: 60,
		marginBottom: 10,
		alignSelf: "center",
	},
	badge: {
		// backgroundColor: "#E0E0E0", // Gray
		// color: "#424242", // Blue text
		paddingVertical: 2,
		paddingHorizontal: 6,
		borderRadius: 6,
		fontSize: 10,
		alignSelf: "flex-start",
	},
});

// Define your color mapping
const inkColorMap: {
	[key: string]: { backgroundColor: string; color: string };
} = {
	Cyan: { backgroundColor: "#00FFFF", color: "#000000" }, // Cyan text on black for contrast
	Magenta: { backgroundColor: "#FF00FF", color: "#FFFFFF" }, // Magenta text on white
	Yellow: { backgroundColor: "#FFFF00", color: "#000000" }, // Yellow text on black for contrast
	Black: { backgroundColor: "#000000", color: "#FFFFFF" }, // Black text on white
	// Add a default or handle cases where item doesn't match
	default: { backgroundColor: "#D0D0D0", color: "#333333" }, // Gray for unknown
};

export interface MaintenanceReportProps {
	client: string;
	location: string;
	department: string;
	model: string;
	serialNo: string;
	date: string;
	workDone: string[];
	refillInk: string[];
	resetBox: string[];
	services: string[];
	replaceParts: string[];
	repairParts: string[];
	replaceUnit: boolean;
	replaceSerialNo?: string; // Optional if not always provided
	notes?: string;
	status: string;
	technician: string;
	signatory: string;
	signPath: string; // Adjust if it's a base64 string or Buffer
	nozzlePath: string;
}

export const MaintainReport: React.FC<{ data: MaintenanceReportProps }> = ({
	data,
}) => (
	<Document>
		<Page size="LETTER" style={styles.page}>
			<Image
				id="logo"
				style={styles.logo}
				src={logoBuffer} // Adjust the path to your logo image
			/>
			<Text style={styles.heading}>Maintenance Report</Text>

			{/* Header Section */}
			<View style={styles.section}>
				<View style={styles.row}>
					<View style={styles.column}>
						<Text style={styles.label}>Client Name:</Text>
						<Text>{data.client}</Text>
					</View>
					<View style={styles.column}>
						<Text style={styles.label}>Location:</Text>
						<Text>{data.location}</Text>
					</View>
					<View style={styles.column}>
						<Text style={styles.label}>Department:</Text>
						<Text>{data.department}</Text>
					</View>
				</View>

				<View style={styles.row}>
					<View style={styles.column}>
						<Text style={styles.label}>Printer Model:</Text>
						<Text>{data.model}</Text>
					</View>
					<View style={styles.column}>
						<Text style={styles.label}>Serial Number:</Text>
						<Text>{data.serialNo}</Text>
					</View>
					<View style={styles.column}>
						<Text style={styles.label}>Date / Time:</Text>
						<Text>{data.date}</Text>
					</View>
				</View>
			</View>

			{/* Work Done & Services */}
			<View style={(styles.section, { borderTopWidth: 1, paddingTop: 5 })}>
				<View style={styles.row}>
					<View style={styles.column}>
						<Text style={styles.label}>Work Done:</Text>
						<View style={styles.checkboxGroup}>
							{data.workDone.map((item, i) => (
								<View style={styles.item} key={i.toString()}>
									<Text key={i}>{item}</Text>
								</View>
							))}
						</View>
						<View style={styles.checkboxGroup}>
							<Text>Refill Ink:</Text>
							{data.refillInk && data.refillInk.length > 0 ? (
								data.refillInk.map((item, i) => {
									const colorStyle = inkColorMap[item] || inkColorMap.default; // Get color from map, or use default
									return (
										<Text
											key={i}
											// Combine the base badge style with the dynamic color style
											style={[
												styles.badge,
												{
													backgroundColor: colorStyle.backgroundColor,
													color: colorStyle.color,
												},
											]}
										>
											{item}
										</Text>
									);
								})
							) : (
								<Text
									style={[
										styles.badge,
										{
											backgroundColor: "#FF9800",
											color: "#FFFFFF",
										},
									]}
								>
									No ink refill recorded.
								</Text>
							)}
						</View>
						<View style={styles.checkboxGroup}>
							<Text>Reset:</Text>
							{data.resetBox && data.resetBox.length > 0 ? (
								data.resetBox.map((item, i) => (
									<View key={i}>
										<Text
											key={i}
											style={[
												styles.badge,
												{ backgroundColor: "#E0E0E0", color: "#424242" },
											]}
										>
											{item}
										</Text>
									</View>
								))
							) : (
								<Text
									style={[
										styles.badge,
										{
											backgroundColor: "#FF9800",
											color: "#FFFFFF",
										},
									]}
								>
									No recorded reset.
								</Text>
							)}
						</View>
						{/* Printer Status and Notes */}
						<View style={(styles.section, { marginTop: 5 })}>
							<Text style={styles.label}>Printer Status:</Text>
							<Text
								style={[
									styles.badge,
									{ backgroundColor: "#2C73D2", color: "#FFFFFF" },
								]}
							>
								{data.status}
							</Text>
						</View>
					</View>
					<View style={styles.column}>
						<Text style={styles.label}>Services:</Text>
						<View style={styles.checkboxGroup}>
							{data.services.map((item, i) => (
								<View style={styles.item} key={i}>
									<Text key={i}>{item}</Text>
								</View>
							))}
						</View>
						<View style={styles.checkboxGroup}>
							<Text>Replacement:</Text>
							{data.replaceParts && data.replaceParts.length > 0 ? (
								data.replaceParts.map((item, i) => (
									<View key={i}>
										<Text
											key={i}
											style={[
												styles.badge,
												{ backgroundColor: "#E0E0E0", color: "#424242" },
											]}
										>
											{item}
										</Text>
									</View>
								))
							) : (
								<Text
									style={[
										styles.badge,
										{
											backgroundColor: "#FF9800",
											color: "#FFFFFF",
										},
									]}
								>
									No replacement.
								</Text>
							)}
						</View>
						<View style={styles.checkboxGroup}>
							<Text>Repair:</Text>
							{data.repairParts && data.repairParts.length > 0 ? (
								data.repairParts.map((item, i) => (
									<View key={i}>
										<Text
											key={i}
											style={[
												styles.badge,
												{ backgroundColor: "#E0E0E0", color: "#424242" },
											]}
										>
											{item}
										</Text>
									</View>
								))
							) : (
								<Text
									style={[
										styles.badge,
										{
											backgroundColor: "#FF9800",
											color: "#FFFFFF",
										},
									]}
								>
									No repair made.
								</Text>
							)}
						</View>
						<View style={styles.checkboxGroup}>
							{data.replaceSerialNo && (
								<>
									<Text>Replace Service Unit:</Text>
									<Text
										style={[
											styles.badge,
											{ backgroundColor: "#4CAF50", color: "#FFFFFF" },
										]}
									>
										{data.replaceSerialNo}
									</Text>
								</>
							)}
						</View>
						<View style={styles.checkboxGroup}>
							{data.notes && (
								<>
									<Text>Notes:</Text>
									<Text style={[styles.badge]}>{data.notes}</Text>
								</>
							)}
						</View>
					</View>
				</View>
			</View>

			{/* Footer */}
			<View style={styles.footer}>
				<View style={styles.signBox}>
					<Text style={styles.label}>Prepared By:</Text>
					<Text>{data.technician}</Text>
				</View>
				<View style={styles.signBox}>
					<Text style={styles.label}>Checked By:</Text>

					<View style={{ flexDirection: "row", justifyContent: "center" }}>
						<View style={{ flex: 1, paddingRight: 5 }}>
							<Text>{data.signatory}</Text>
						</View>

						<View style={{ flex: 1 }}>
							{data.signPath ? (
								<Image
									id="signLogo"
									src={data.signPath}
									style={{ width: "100%" }}
								/>
							) : (
								<Text>No Signature Available.</Text>
							)}
						</View>
					</View>
				</View>
			</View>
			<View style={{ marginTop: 10 }}>
				<View style={{ flexDirection: "row", justifyContent: "flex-start" }}>
					<View
						style={{
							flex: 1,
							height: 300, // Explicit fixed height in PDF points (e.g., 300 points)
						}}
					>
						{data.nozzlePath ? (
							<Image
								id="nozzleCheck"
								src={data.nozzlePath}
								style={{
									width: "100%",
									height: "100%",
									objectFit: "contain", // Safely scales the image within the container
								}}
							/>
						) : (
							<Text style={{ textAlign: "center", marginTop: 140 }}>
								No Nozzle Check Image Available.
							</Text>
						)}
					</View>
				</View>
			</View>
		</Page>
	</Document>
);
