import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireStaff } from "./lib/access";
import { logAudit } from "./lib/audit";
import { isoDate, optionalIsoDate } from "./lib/validators";

function assertMinorUnits(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new ConvexError("Amounts must be integers in minor units (e.g. cents).");
  }
}

/** Billing profile plus recent balance snapshots for one household. */
export const getHouseholdFinance = query({
  args: { householdId: v.id("households") },
  handler: async (ctx, args) => {
    const household = await ctx.db.get(args.householdId);
    if (household === null) {
      return null;
    }
    await requireStaff(ctx, household.institutionId);

    const profile = await ctx.db
      .query("householdBillingProfiles")
      .withIndex("by_household", (q) => q.eq("householdId", args.householdId))
      .unique();
    if (profile === null) {
      return { profile: null, snapshots: [] };
    }
    const snapshots = await ctx.db
      .query("householdBalanceSnapshots")
      .withIndex("by_profile_date", (q) => q.eq("billingProfileId", profile._id))
      .order("desc")
      .take(12);
    return { profile, snapshots };
  },
});

export const upsertHouseholdBillingProfile = mutation({
  args: {
    householdId: v.id("households"),
    deliveryMethod: v.optional(v.string()),
    discountNotes: v.optional(v.string()),
    balanceMinor: v.optional(v.number()),
    balanceAsOf: optionalIsoDate,
    currency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const household = await ctx.db.get(args.householdId);
    if (household === null) {
      throw new ConvexError("Household not found.");
    }
    const { userId } = await requireStaff(ctx, household.institutionId);
    if (args.balanceMinor !== undefined) {
      assertMinorUnits(args.balanceMinor);
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("householdBillingProfiles")
      .withIndex("by_household", (q) => q.eq("householdId", args.householdId))
      .unique();

    let profileId = existing?._id;
    if (existing === null) {
      profileId = await ctx.db.insert("householdBillingProfiles", {
        institutionId: household.institutionId,
        householdId: args.householdId,
        deliveryMethod: args.deliveryMethod,
        discountNotes: args.discountNotes,
        balanceMinor: args.balanceMinor ?? 0,
        balanceAsOf: args.balanceAsOf,
        currency: args.currency ?? "USD",
        metadata: {},
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(existing._id, {
        ...(args.deliveryMethod === undefined ? {} : { deliveryMethod: args.deliveryMethod }),
        ...(args.discountNotes === undefined ? {} : { discountNotes: args.discountNotes }),
        ...(args.balanceMinor === undefined ? {} : { balanceMinor: args.balanceMinor }),
        ...(args.balanceAsOf === undefined ? {} : { balanceAsOf: args.balanceAsOf }),
        ...(args.currency === undefined ? {} : { currency: args.currency }),
        updatedAt: now,
      });
    }
    await logAudit(ctx, {
      institutionId: household.institutionId,
      actorUserId: userId,
      entityType: "billingProfile",
      entityId: args.householdId,
      action: existing === null ? "create" : "update",
      before: existing === null ? undefined : { balanceMinor: existing.balanceMinor },
      after: { balanceMinor: args.balanceMinor },
    });
    return profileId;
  },
});

/**
 * Record a dated balance snapshot, creating the billing profile if needed.
 * The profile's live balance advances when the snapshot is the newest one.
 */
export const recordBalanceSnapshot = mutation({
  args: {
    householdId: v.id("households"),
    asOfDate: isoDate,
    balanceMinor: v.number(),
  },
  handler: async (ctx, args) => {
    const household = await ctx.db.get(args.householdId);
    if (household === null) {
      throw new ConvexError("Household not found.");
    }
    const { userId } = await requireStaff(ctx, household.institutionId);
    assertMinorUnits(args.balanceMinor);

    const now = Date.now();
    let profile = await ctx.db
      .query("householdBillingProfiles")
      .withIndex("by_household", (q) => q.eq("householdId", args.householdId))
      .unique();
    if (profile === null) {
      const profileId = await ctx.db.insert("householdBillingProfiles", {
        institutionId: household.institutionId,
        householdId: args.householdId,
        balanceMinor: 0,
        currency: "USD",
        metadata: {},
        updatedAt: now,
      });
      profile = await ctx.db.get(profileId);
      if (profile === null) {
        throw new ConvexError("Failed to create billing profile.");
      }
    }

    const existing = await ctx.db
      .query("householdBalanceSnapshots")
      .withIndex("by_profile_date", (q) =>
        q.eq("billingProfileId", profile._id).eq("asOfDate", args.asOfDate),
      )
      .unique();
    let snapshotId = existing?._id;
    if (existing !== null) {
      await ctx.db.patch(existing._id, { balanceMinor: args.balanceMinor });
    } else {
      snapshotId = await ctx.db.insert("householdBalanceSnapshots", {
        institutionId: household.institutionId,
        billingProfileId: profile._id,
        asOfDate: args.asOfDate,
        balanceMinor: args.balanceMinor,
        metadata: {},
      });
    }

    if (profile.balanceAsOf === undefined || args.asOfDate >= profile.balanceAsOf) {
      await ctx.db.patch(profile._id, {
        balanceMinor: args.balanceMinor,
        balanceAsOf: args.asOfDate,
        updatedAt: now,
      });
    }

    await logAudit(ctx, {
      institutionId: household.institutionId,
      actorUserId: userId,
      entityType: "balanceSnapshot",
      entityId: `${args.householdId}:${args.asOfDate}`,
      action: existing === null ? "create" : "update",
      after: { balanceMinor: args.balanceMinor, asOfDate: args.asOfDate },
    });
    return snapshotId;
  },
});
