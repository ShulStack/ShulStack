import { OPEN_PLEDGE_STAGES, type PledgeStage } from "@shulstack/platform";
import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { recordLedgerEntry } from "./ledger";
import { requireStaff, staffOrNull } from "./lib/access";
import { logAudit } from "./lib/audit";
import { emitDomainEvent } from "./lib/domainEvents";
import {
  assertIsoDate,
  campaignStatusValidator,
  isoDate,
  optionalIsoDate,
  pledgeStageValidator,
} from "./lib/validators";

/**
 * Campaigns and the pledge pipeline. Money is deliberately not stored here:
 * `recordPledgePayment` writes received gifts onto the household ledger (a
 * donation charge plus its payment, net zero on the balance) and only tracks
 * the running `paidMinor` against the commitment.
 */

function assertGoalAmount(value: number | undefined, label: string): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
    throw new ConvexError(`${label} must be a non-negative integer in minor units.`);
  }
}

// --- Campaigns -----------------------------------------------------------------

export const createCampaign = mutation({
  args: {
    institutionId: v.id("institutions"),
    name: v.string(),
    description: v.optional(v.string()),
    goalMinor: v.optional(v.number()),
    startDate: optionalIsoDate,
    endDate: optionalIsoDate,
  },
  handler: async (ctx, args) => {
    const { userId } = await requireStaff(ctx, args.institutionId, "admin");
    const name = args.name.trim();
    if (name === "") {
      throw new ConvexError("Campaign name is required.");
    }
    assertGoalAmount(args.goalMinor, "Goal");
    if (args.startDate !== undefined) {
      assertIsoDate(args.startDate);
    }
    if (args.endDate !== undefined) {
      assertIsoDate(args.endDate);
    }

    const campaignId = await ctx.db.insert("campaigns", {
      institutionId: args.institutionId,
      name,
      description: args.description,
      goalMinor: args.goalMinor,
      startDate: args.startDate,
      endDate: args.endDate,
      status: "active",
      updatedAt: Date.now(),
    });
    await logAudit(ctx, {
      institutionId: args.institutionId,
      actorUserId: userId,
      entityType: "campaign",
      entityId: campaignId,
      action: "create",
      after: { name, goalMinor: args.goalMinor },
    });
    await emitDomainEvent(ctx, {
      institutionId: args.institutionId,
      eventName: "campaign.created",
      payload: { campaignId },
    });
    return campaignId;
  },
});

export const updateCampaign = mutation({
  args: {
    campaignId: v.id("campaigns"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    goalMinor: v.optional(v.number()),
    startDate: optionalIsoDate,
    endDate: optionalIsoDate,
    status: v.optional(campaignStatusValidator),
  },
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.campaignId);
    if (campaign === null) {
      throw new ConvexError("Campaign not found.");
    }
    const { userId } = await requireStaff(ctx, campaign.institutionId, "admin");
    const name = args.name?.trim();
    if (name === "") {
      throw new ConvexError("Campaign name cannot be empty.");
    }
    assertGoalAmount(args.goalMinor, "Goal");
    if (args.startDate !== undefined) {
      assertIsoDate(args.startDate);
    }
    if (args.endDate !== undefined) {
      assertIsoDate(args.endDate);
    }
    await ctx.db.patch(campaign._id, {
      ...(name === undefined ? {} : { name }),
      ...(args.description === undefined ? {} : { description: args.description }),
      ...(args.goalMinor === undefined ? {} : { goalMinor: args.goalMinor }),
      ...(args.startDate === undefined ? {} : { startDate: args.startDate }),
      ...(args.endDate === undefined ? {} : { endDate: args.endDate }),
      ...(args.status === undefined ? {} : { status: args.status }),
      updatedAt: Date.now(),
    });
    await logAudit(ctx, {
      institutionId: campaign.institutionId,
      actorUserId: userId,
      entityType: "campaign",
      entityId: campaign._id,
      action: "update",
      before: { name: campaign.name, status: campaign.status },
      after: { name: name ?? campaign.name, status: args.status ?? campaign.status },
    });
  },
});

type PledgeRollup = {
  pledgeCount: number;
  openCount: number;
  committedMinor: number;
  raisedMinor: number;
};

export function rollupPledges(pledges: Doc<"pledges">[]): PledgeRollup {
  const openStages = new Set<string>(OPEN_PLEDGE_STAGES);
  let openCount = 0;
  let committedMinor = 0;
  let raisedMinor = 0;
  for (const pledge of pledges) {
    if (openStages.has(pledge.stage)) {
      openCount += 1;
    }
    if (pledge.stage === "pledged" || pledge.stage === "fulfilled") {
      committedMinor += pledge.amountMinor;
    }
    raisedMinor += pledge.paidMinor;
  }
  return { pledgeCount: pledges.length, openCount, committedMinor, raisedMinor };
}

export async function campaignPledges(
  ctx: QueryCtx,
  campaignId: Id<"campaigns">,
): Promise<Doc<"pledges">[]> {
  return await ctx.db
    .query("pledges")
    .withIndex("by_campaign_stage", (q) => q.eq("campaignId", campaignId))
    .collect();
}

/** Campaigns with pipeline rollups. Reads whole (indexed) ranges — fine at
 * synagogue scale, same trade-off as crm.dashboardStats. */
export const listCampaigns = query({
  args: { institutionId: v.id("institutions") },
  handler: async (ctx, args) => {
    await requireStaff(ctx, args.institutionId);
    const campaigns = await ctx.db
      .query("campaigns")
      .withIndex("by_institution", (q) => q.eq("institutionId", args.institutionId))
      .order("desc")
      .collect();
    const results = [];
    for (const campaign of campaigns) {
      const pledges = await campaignPledges(ctx, campaign._id);
      results.push({ ...campaign, rollup: rollupPledges(pledges) });
    }
    return results;
  },
});

/** One campaign with its full pledge list (joined to names) and rollups. */
export const getCampaign = query({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.campaignId);
    if (campaign === null || (await staffOrNull(ctx, campaign.institutionId)) === null) {
      return null;
    }
    const pledges = await campaignPledges(ctx, campaign._id);
    const joined = [];
    for (const pledge of pledges) {
      joined.push(await joinPledge(ctx, pledge, { campaign }));
    }
    joined.sort((a, b) => b.updatedAt - a.updatedAt);
    return { campaign, pledges: joined, rollup: rollupPledges(pledges) };
  },
});

// --- Pledges -------------------------------------------------------------------

export async function joinPledge(
  ctx: QueryCtx,
  pledge: Doc<"pledges">,
  preloaded: { campaign?: Doc<"campaigns"> } = {},
) {
  const campaign = preloaded.campaign ?? (await ctx.db.get(pledge.campaignId));
  const household = await ctx.db.get(pledge.householdId);
  const person = pledge.personId === undefined ? null : await ctx.db.get(pledge.personId);
  return {
    pledgeId: pledge._id,
    campaignId: pledge.campaignId,
    campaignName: campaign?.name ?? "—",
    householdId: pledge.householdId,
    householdName: household?.displayName ?? "—",
    personId: pledge.personId,
    personName: person?.displayName,
    amountMinor: pledge.amountMinor,
    paidMinor: pledge.paidMinor,
    stage: pledge.stage,
    notes: pledge.notes,
    updatedAt: pledge.updatedAt,
  };
}

export const createPledge = mutation({
  args: {
    campaignId: v.id("campaigns"),
    householdId: v.id("households"),
    personId: v.optional(v.id("people")),
    amountMinor: v.number(),
    stage: v.optional(pledgeStageValidator),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.campaignId);
    if (campaign === null) {
      throw new ConvexError("Campaign not found.");
    }
    const { userId } = await requireStaff(ctx, campaign.institutionId);
    const household = await ctx.db.get(args.householdId);
    if (household === null || household.institutionId !== campaign.institutionId) {
      throw new ConvexError("Household not found.");
    }
    if (args.personId !== undefined) {
      const person = await ctx.db.get(args.personId);
      if (person === null || person.institutionId !== campaign.institutionId) {
        throw new ConvexError("Person not found.");
      }
    }
    assertGoalAmount(args.amountMinor, "Pledge amount");

    const pledgeId = await ctx.db.insert("pledges", {
      institutionId: campaign.institutionId,
      campaignId: campaign._id,
      householdId: household._id,
      personId: args.personId,
      amountMinor: args.amountMinor,
      paidMinor: 0,
      stage: args.stage ?? "prospect",
      notes: args.notes,
      updatedAt: Date.now(),
    });
    await logAudit(ctx, {
      institutionId: campaign.institutionId,
      actorUserId: userId,
      entityType: "pledge",
      entityId: pledgeId,
      action: "create",
      after: {
        campaign: campaign.name,
        household: household.displayName,
        amountMinor: args.amountMinor,
        stage: args.stage ?? "prospect",
      },
    });
    await emitDomainEvent(ctx, {
      institutionId: campaign.institutionId,
      eventName: "pledge.created",
      payload: { pledgeId, campaignId: campaign._id, householdId: household._id },
    });
    return pledgeId;
  },
});

export const updatePledge = mutation({
  args: {
    pledgeId: v.id("pledges"),
    stage: v.optional(pledgeStageValidator),
    amountMinor: v.optional(v.number()),
    personId: v.optional(v.union(v.id("people"), v.null())),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const pledge = await ctx.db.get(args.pledgeId);
    if (pledge === null) {
      throw new ConvexError("Pledge not found.");
    }
    const { userId } = await requireStaff(ctx, pledge.institutionId);
    assertGoalAmount(args.amountMinor, "Pledge amount");
    if (args.personId !== undefined && args.personId !== null) {
      const person = await ctx.db.get(args.personId);
      if (person === null || person.institutionId !== pledge.institutionId) {
        throw new ConvexError("Person not found.");
      }
    }

    await ctx.db.patch(pledge._id, {
      ...(args.stage === undefined ? {} : { stage: args.stage }),
      ...(args.amountMinor === undefined ? {} : { amountMinor: args.amountMinor }),
      ...(args.personId === undefined ? {} : { personId: args.personId ?? undefined }),
      ...(args.notes === undefined
        ? {}
        : { notes: args.notes.trim() === "" ? undefined : args.notes }),
      updatedAt: Date.now(),
    });
    await logAudit(ctx, {
      institutionId: pledge.institutionId,
      actorUserId: userId,
      entityType: "pledge",
      entityId: pledge._id,
      action: "update",
      before: { stage: pledge.stage, amountMinor: pledge.amountMinor },
      after: {
        stage: args.stage ?? pledge.stage,
        amountMinor: args.amountMinor ?? pledge.amountMinor,
      },
    });
    await emitDomainEvent(ctx, {
      institutionId: pledge.institutionId,
      eventName: "pledge.updated",
      payload: { pledgeId: pledge._id },
    });
  },
});

/** Where an incoming payment should move the pipeline. */
function stageAfterPayment(
  current: PledgeStage,
  paidMinor: number,
  amountMinor: number,
): PledgeStage {
  if (amountMinor > 0 && paidMinor >= amountMinor) {
    return "fulfilled";
  }
  if (current === "prospect" || current === "cultivating" || current === "asked") {
    return "pledged";
  }
  return current;
}

/**
 * Record a received gift against a pledge. Writes the money onto the
 * household ledger as a donation charge plus its payment (net zero on the
 * balance, mirroring how gifts appear in ShulCloud exports), bumps the
 * pledge's paidMinor, and advances the stage.
 */
export const recordPledgePayment = mutation({
  args: {
    pledgeId: v.id("pledges"),
    amountMinor: v.number(),
    occurredAt: isoDate,
    method: v.optional(v.string()),
    memo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const pledge = await ctx.db.get(args.pledgeId);
    if (pledge === null) {
      throw new ConvexError("Pledge not found.");
    }
    const { userId } = await requireStaff(ctx, pledge.institutionId);
    if (!Number.isSafeInteger(args.amountMinor) || args.amountMinor <= 0) {
      throw new ConvexError("Payments must be positive integers in minor units.");
    }
    const campaign = await ctx.db.get(pledge.campaignId);
    const household = await ctx.db.get(pledge.householdId);
    if (campaign === null || household === null) {
      throw new ConvexError("Pledge is missing its campaign or household.");
    }

    const memo = args.memo ?? `Gift — ${campaign.name}`;
    await recordLedgerEntry(ctx, household, {
      entryType: "charge",
      amountMinor: args.amountMinor,
      occurredAt: args.occurredAt,
      category: campaign.name,
      memo,
      createdBy: userId,
      metadata: { pledgeId: pledge._id, campaignId: campaign._id },
    });
    await recordLedgerEntry(ctx, household, {
      entryType: "payment",
      amountMinor: args.amountMinor,
      occurredAt: args.occurredAt,
      category: campaign.name,
      method: args.method,
      memo,
      createdBy: userId,
      metadata: { pledgeId: pledge._id, campaignId: campaign._id },
    });

    const paidMinor = pledge.paidMinor + args.amountMinor;
    const stage = stageAfterPayment(pledge.stage, paidMinor, pledge.amountMinor);
    await ctx.db.patch(pledge._id, { paidMinor, stage, updatedAt: Date.now() });

    await logAudit(ctx, {
      institutionId: pledge.institutionId,
      actorUserId: userId,
      entityType: "pledge",
      entityId: pledge._id,
      action: "update",
      after: { paymentMinor: args.amountMinor, paidMinor, stage, campaign: campaign.name },
    });
    await emitDomainEvent(ctx, {
      institutionId: pledge.institutionId,
      eventName: "payment.recorded",
      payload: {
        pledgeId: pledge._id,
        campaignId: campaign._id,
        householdId: household._id,
        amountMinor: args.amountMinor,
      },
    });
    return { paidMinor, stage };
  },
});

/** Every pledge in the institution, joined to names, for the screening
 * table. Whole-range read, synagogue-scale trade-off as documented above. */
export const listPledges = query({
  args: { institutionId: v.id("institutions") },
  handler: async (ctx, args) => {
    await requireStaff(ctx, args.institutionId);
    const pledges = await ctx.db
      .query("pledges")
      .withIndex("by_institution_stage", (q) => q.eq("institutionId", args.institutionId))
      .collect();
    const joined = [];
    for (const pledge of pledges) {
      joined.push(await joinPledge(ctx, pledge));
    }
    joined.sort((a, b) => b.updatedAt - a.updatedAt);
    return joined;
  },
});

export const listPledgesForHousehold = query({
  args: { householdId: v.id("households") },
  handler: async (ctx, args) => {
    const household = await ctx.db.get(args.householdId);
    if (household === null || (await staffOrNull(ctx, household.institutionId)) === null) {
      return null;
    }
    const pledges = await ctx.db
      .query("pledges")
      .withIndex("by_household", (q) => q.eq("householdId", args.householdId))
      .collect();
    const joined = [];
    for (const pledge of pledges) {
      joined.push(await joinPledge(ctx, pledge));
    }
    joined.sort((a, b) => b.updatedAt - a.updatedAt);
    return joined;
  },
});

export const listPledgesForPerson = query({
  args: { personId: v.id("people") },
  handler: async (ctx, args) => {
    const person = await ctx.db.get(args.personId);
    if (person === null || (await staffOrNull(ctx, person.institutionId)) === null) {
      return null;
    }
    const pledges = await ctx.db
      .query("pledges")
      .withIndex("by_person", (q) => q.eq("personId", args.personId))
      .collect();
    const joined = [];
    for (const pledge of pledges) {
      joined.push(await joinPledge(ctx, pledge));
    }
    joined.sort((a, b) => b.updatedAt - a.updatedAt);
    return joined;
  },
});
