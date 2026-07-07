import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { StaffRole } from "./validators";

const ROLE_RANK: Record<StaffRole, number> = {
  staff: 1,
  admin: 2,
  owner: 3,
};

export function roleAtLeast(role: StaffRole, minimum: StaffRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export async function requireUserId(ctx: QueryCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new ConvexError("You must be signed in.");
  }
  return userId;
}

export type StaffContext = {
  userId: Id<"users">;
  staff: Doc<"staffMembers">;
  institution: Doc<"institutions">;
};

/**
 * The authorization gate for every staff-facing function: resolves the
 * signed-in user's active staff membership at the institution and enforces a
 * minimum role. Throws a ConvexError (safe to surface to clients) otherwise.
 */
export async function requireStaff(
  ctx: QueryCtx,
  institutionId: Id<"institutions">,
  minimumRole: StaffRole = "staff",
): Promise<StaffContext> {
  const userId = await requireUserId(ctx);
  const staff = await ctx.db
    .query("staffMembers")
    .withIndex("by_institution_user", (q) =>
      q.eq("institutionId", institutionId).eq("userId", userId),
    )
    .unique();

  if (staff === null || !staff.isActive) {
    throw new ConvexError("You do not have access to this institution.");
  }
  if (!roleAtLeast(staff.role, minimumRole)) {
    throw new ConvexError(`This action requires the ${minimumRole} role.`);
  }

  const institution = await ctx.db.get(institutionId);
  if (institution === null) {
    throw new ConvexError("Institution not found.");
  }

  return { userId, staff, institution };
}
