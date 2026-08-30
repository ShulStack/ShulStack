import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireStaff } from "./lib/access";
import { logAudit } from "./lib/audit";
import { emitDomainEvent } from "./lib/domainEvents";
import {
  assertIsoDate,
  isoDate,
  type LedgerEntryType,
  ledgerEntryTypeValidator,
  metadataValidator,
} from "./lib/validators";

/** Signed effect of an entry on the household balance (positive = owes more). */
export function ledgerDelta(entryType: LedgerEntryType, amountMinor: number): number {
  switch (entryType) {
    case "charge":
      return amountMinor;
    case "payment":
    case "credit":
      return -amountMinor;
    case "opening_balance":
      return amountMinor;
  }
}

type LedgerEntryInput = {
  entryType: LedgerEntryType;
  amountMinor: number;
  occurredAt: string;
  category?: string;
  method?: string;
  memo?: string;
  createdBy?: Id<"users">;
  metadata?: Record<string, unknown>;
};

/**
 * Insert a ledger entry and atomically move the household's billing-profile
 * balance (creating the profile if needed). Shared by the staff mutation,
 * the ShulCloud importer, and the demo seed. Caller is responsible for
 * authorization.
 */
export async function recordLedgerEntry(
  ctx: MutationCtx,
  household: Doc<"households">,
  input: LedgerEntryInput,
): Promise<Id<"ledgerEntries">> {
  if (!Number.isSafeInteger(input.amountMinor)) {
    throw new ConvexError("Amounts must be integers in minor units (e.g. cents).");
  }
  if (input.entryType !== "opening_balance" && input.amountMinor <= 0) {
    throw new ConvexError("Charges, payments, and credits must be positive amounts.");
  }
  assertIsoDate(input.occurredAt);

  const now = Date.now();
  const entryId = await ctx.db.insert("ledgerEntries", {
    institutionId: household.institutionId,
    householdId: household._id,
    entryType: input.entryType,
    amountMinor: input.amountMinor,
    occurredAt: input.occurredAt,
    category: input.category,
    method: input.method,
    memo: input.memo,
    createdBy: input.createdBy,
    metadata: input.metadata ?? {},
  });

  const delta = ledgerDelta(input.entryType, input.amountMinor);
  const profile = await ctx.db
    .query("householdBillingProfiles")
    .withIndex("by_household", (q) => q.eq("householdId", household._id))
    .unique();
  if (profile === null) {
    await ctx.db.insert("householdBillingProfiles", {
      institutionId: household.institutionId,
      householdId: household._id,
      balanceMinor: delta,
      balanceAsOf: input.occurredAt,
      currency: "USD",
      metadata: {},
      updatedAt: now,
    });
  } else {
    await ctx.db.patch(profile._id, {
      balanceMinor: profile.balanceMinor + delta,
      balanceAsOf:
        profile.balanceAsOf === undefined || input.occurredAt > profile.balanceAsOf
          ? input.occurredAt
          : profile.balanceAsOf,
      updatedAt: now,
    });
  }
  return entryId;
}

export const addLedgerEntry = mutation({
  args: {
    householdId: v.id("households"),
    entryType: ledgerEntryTypeValidator,
    amountMinor: v.number(),
    occurredAt: isoDate,
    category: v.optional(v.string()),
    method: v.optional(v.string()),
    memo: v.optional(v.string()),
    metadata: v.optional(metadataValidator),
  },
  handler: async (ctx, args) => {
    const household = await ctx.db.get(args.householdId);
    if (household === null) {
      throw new ConvexError("Household not found.");
    }
    const { userId } = await requireStaff(ctx, household.institutionId);

    const entryId = await recordLedgerEntry(ctx, household, {
      entryType: args.entryType,
      amountMinor: args.amountMinor,
      occurredAt: args.occurredAt,
      category: args.category,
      method: args.method,
      memo: args.memo,
      createdBy: userId,
      metadata: args.metadata,
    });
    await logAudit(ctx, {
      institutionId: household.institutionId,
      actorUserId: userId,
      entityType: "ledgerEntry",
      entityId: entryId,
      action: "create",
      after: {
        entryType: args.entryType,
        amountMinor: args.amountMinor,
        occurredAt: args.occurredAt,
      },
    });
    await emitDomainEvent(ctx, {
      institutionId: household.institutionId,
      eventName: args.entryType === "payment" ? "payment.recorded" : "ledger.entry.recorded",
      payload: {
        householdId: args.householdId,
        entryType: args.entryType,
        amountMinor: args.amountMinor,
      },
    });
    return entryId;
  },
});

export const listLedgerEntries = query({
  args: {
    householdId: v.id("households"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const household = await ctx.db.get(args.householdId);
    if (household === null) {
      throw new ConvexError("Household not found.");
    }
    await requireStaff(ctx, household.institutionId);
    return await ctx.db
      .query("ledgerEntries")
      .withIndex("by_household_date", (q) => q.eq("householdId", args.householdId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});
