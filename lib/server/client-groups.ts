// lib/server/client-groups.ts
import "server-only";
import { db } from "@/db";
import { clientGroups } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Validates that a client's chosen Client Group (if any) actually belongs
 * to the client's own Area — a South Area client can't be filed under a
 * North Area group, since the group's own `area` column is what places its
 * gray separator row (and every client under it) in the Monitoring
 * report's South or North section. Returns an error message to show the
 * caller, or null when the assignment is fine — including "no group
 * chosen at all," which is always fine.
 *
 * Shared by both the create and update paths in
 * app/api/admin/master/clients/route.ts and .../[id]/route.ts, so the two
 * can never enforce this rule differently.
 */
export async function validateClientGroupArea(
	clientGroupId: number | null | undefined,
	area: string | null | undefined
): Promise<string | null> {
	if (!clientGroupId) return null;

	const [group] = await db
		.select({ id: clientGroups.id, area: clientGroups.area })
		.from(clientGroups)
		.where(eq(clientGroups.id, clientGroupId))
		.limit(1);

	if (!group) return "That Client Group no longer exists.";
	if (!area) {
		return "Set this client's Area before assigning it to a Client Group.";
	}
	if (group.area !== area) {
		return `That Client Group belongs to the ${group.area} Area, not ${area}.`;
	}
	return null;
}
