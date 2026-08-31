import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { ledgerDelta } from "./ledger";
import { requireStaff, staffOrNull } from "./lib/access";
import { logAudit } from "./lib/audit";
import { assertIsoDate, isoDate, normalizeCurrency } from "./lib/validators";

/**
 * The ledger (see ledger.ts) is the sole owner of household balances. Nothing
 * in this module writes `balanceMinor` except repairHouseholdBalance, which
 * can only reset it to the ledger sum.
 */

async function ledgerBalanceMinor(
  ctx: QueryCtx,
  householdId: Id<"households">,
): Promise<{ balanceMinor: number; entryCount: number; latestDate?: string }> {
  const entries = await ctx.db
    .query("ledgerEntries")
    .withIndex("by_household_date", (q) => q.eq("householdId", householdId))
    .collect();
  let balanceMinor = 0;
  let latestDate: string | undefined;
  for (const entry of entries) {
    balanceMinor += ledgerDelta(entry.entryType, entry.amountMinor);
    if (latestDate === undefined || entry.occurredAt > latestDate) {
      latestDate = entry.occurredAt;
    }
  }
  return { balanceMinor, entryCount: entries.length, latestDate };
}

async function getBillingProfile(
  ctx: QueryCtx,
  householdId: Id<"households">,
): Promise<Doc<"householdBillingProfiles"> | null> {
  return await ctx.db
    .query("householdBillingProfiles")
    .withIndex("by_household", (q) => q.eq("householdId", householdId))
    .unique();
}

/** Billing profile plus recent balance snapshots for one household. */
export const getHouseholdFinance = query({
  args: { householdId: v.id("households") },
  handler: async (ctx, args) => {
    const household = await ctx.db.get(args.householdId);
    if (household === null || (await staffOrNull(ctx, household.institutionId)) === null) {
      return null;
    }

    const profile = await getBillingProfile(ctx, args.householdId);
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

/**
 * Billing preferences for a household. Balance fields are deliberately not
 * accepted here: corrections are ledger entries, never edits.
 */
export const upsertHouseholdBillingProfile = mutation({
  args: {
    householdId: v.id("households"),
    deliveryMethod: v.optional(v.string()),
    discountNotes: v.optional(v.string()),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const household = await ctx.db.get(args.householdId);
    if (household === null) {
      throw new ConvexError("Household not found.");
    }
    const { userId } = await requireStaff(ctx, household.institutionId);
    const currency = args.currency === undefined ? undefined : normalizeCurrency(args.currency);

    const now = Date.now();
    const existing = await getBillingProfile(ctx, args.householdId);
    if (currency !== undefined && existing !== null && currency !== existing.currency) {
      const anyEntry = await ctx.db
        .query("ledgerEntries")
        .withIndex("by_household_date", (q) => q.eq("householdId", args.householdId))
        .first();
      if (anyEntry !== null) {
        throw new ConvexError("Currency cannot change once the household has ledger entries.");
      }
    }

    let profileId = existing?._id;
    if (existing === null) {
      profileId = await ctx.db.insert("householdBillingProfiles", {
        institutionId: household.institutionId,
        householdId: args.householdId,
        deliveryMethod: args.deliveryMethod,
        discountNotes: args.discountNotes,
        balanceMinor: 0,
        currency: currency ?? "USD",
        metadata: {},
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(existing._id, {
        ...(args.deliveryMethod === undefined ? {} : { deliveryMethod: args.deliveryMethod }),
        ...(args.discountNotes === undefined ? {} : { discountNotes: args.discountNotes }),
        ...(currency === undefined ? {} : { currency }),
        updatedAt: now,
      });
    }
    await logAudit(ctx, {
      institutionId: household.institutionId,
      actorUserId: userId,
      entityType: "billingProfile",
      entityId: args.householdId,
      action: existing === null ? "create" : "update",
      after: {
        deliveryMethod: args.deliveryMethod,
        discountNotes: args.discountNotes,
        currency,
      },
    });
    return profileId;
  },
});

/**
 * Record a dated snapshot of the household's ledger-derived balance, for
 * statements and period-end records. Snapshots are derived artifacts: they
 * never write the live balance, so they can never desynchronize it.
 */
export const recordBalanceSnapshot = mutation({
  args: {
    householdId: v.id("households"),
    asOfDate: isoDate,
  },
  handler: async (ctx, args) => {
    const household = await ctx.db.get(args.householdId);
    if (household === null) {
      throw new ConvexError("Household not found.");
    }
    const { userId } = await requireStaff(ctx, household.institutionId);
    assertIsoDate(args.asOfDate);

    const { balanceMinor } = await ledgerBalanceMinor(ctx, args.householdId);
    const now = Date.now();
    let profile = await getBillingProfile(ctx, args.householdId);
    if (profile === null) {
      const profileId = await ctx.db.insert("householdBillingProfiles", {
        institutionId: household.institutionId,
        householdId: args.householdId,
        balanceMinor,
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
      await ctx.db.patch(existing._id, { balanceMinor });
    } else {
      snapshotId = await ctx.db.insert("householdBalanceSnapshots", {
        institutionId: household.institutionId,
        billingProfileId: profile._id,
        asOfDate: args.asOfDate,
        balanceMinor,
        metadata: {},
      });
    }

    await logAudit(ctx, {
      institutionId: household.institutionId,
      actorUserId: userId,
      entityType: "balanceSnapshot",
      entityId: `${args.householdId}:${args.asOfDate}`,
      action: existing === null ? "create" : "update",
      after: { balanceMinor, asOfDate: args.asOfDate },
    });
    return snapshotId;
  },
});

/**
 * Compare every billing profile's live balance against the sum of its ledger
 * entries. A non-empty `mismatches` means a bug (or a manual dashboard edit)
 * and should be corrected with repairHouseholdBalance.
 */
export const reconcileBalances = query({
  args: { institutionId: v.id("institutions") },
  handler: async (ctx, args) => {
    await requireStaff(ctx, args.institutionId, "admin");

    const entries = await ctx.db
      .query("ledgerEntries")
      .withIndex("by_institution_date", (q) => q.eq("institutionId", args.institutionId))
      .collect();
    const ledgerTotals = new Map<Id<"households">, number>();
    for (const entry of entries) {
      const current = ledgerTotals.get(entry.householdId) ?? 0;
      ledgerTotals.set(
        entry.householdId,
        current + ledgerDelta(entry.entryType, entry.amountMinor),
      );
    }

    const profiles = await ctx.db
      .query("householdBillingProfiles")
      .withIndex("by_institution", (q) => q.eq("institutionId", args.institutionId))
      .collect();
    const mismatches = [];
    for (const profile of profiles) {
      const ledgerMinor = ledgerTotals.get(profile.householdId) ?? 0;
      if (ledgerMinor !== profile.balanceMinor) {
        mismatches.push({
          householdId: profile.householdId,
          balanceMinor: profile.balanceMinor,
          ledgerMinor,
        });
      }
      ledgerTotals.delete(profile.householdId);
    }
    // Anything left has ledger entries but no billing profile at all.
    for (const [householdId, ledgerMinor] of ledgerTotals) {
      mismatches.push({ householdId, balanceMinor: null, ledgerMinor });
    }

    return {
      entriesChecked: entries.length,
      profilesChecked: profiles.length,
      mismatches,
    };
  },
});

/** Reset one household's live balance to its ledger sum. Admin-only. */
export const repairHouseholdBalance = mutation({
  args: { householdId: v.id("households") },
  handler: async (ctx, args) => {
    const household = await ctx.db.get(args.householdId);
    if (household === null) {
      throw new ConvexError("Household not found.");
    }
    const { userId } = await requireStaff(ctx, household.institutionId, "admin");

    const { balanceMinor, latestDate } = await ledgerBalanceMinor(ctx, args.householdId);
    const now = Date.now();
    const existing = await getBillingProfile(ctx, args.householdId);
    if (existing === null) {
      await ctx.db.insert("householdBillingProfiles", {
        institutionId: household.institutionId,
        householdId: args.householdId,
        balanceMinor,
        balanceAsOf: latestDate,
        currency: "USD",
        metadata: {},
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(existing._id, {
        balanceMinor,
        balanceAsOf: latestDate ?? existing.balanceAsOf,
        updatedAt: now,
      });
    }
    await logAudit(ctx, {
      institutionId: household.institutionId,
      actorUserId: userId,
      entityType: "billingProfile",
      entityId: args.householdId,
      action: "update",
      before: existing === null ? undefined : { balanceMinor: existing.balanceMinor },
      after: { balanceMinor, repairedFromLedger: true },
    });
    return { balanceMinor };
  },
});
