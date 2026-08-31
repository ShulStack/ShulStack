import { OPEN_PLEDGE_STAGES, PLEDGE_STAGE_SLUGS } from "@shulstack/platform";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { httpAction, internalQuery } from "./_generated/server";
import { campaignPledges, joinPledge, rollupPledges } from "./fundraising";
import { authenticate, dateParam, errorResponse, jsonResponse } from "./httpApi";
import { pledgeStageValidator } from "./lib/validators";

/**
 * Aggregation endpoints for the read API: community-wide giving rollups,
 * category totals, campaigns, and pledges. These answer the questions agents
 * and dashboards actually ask ("who gave more than X", "how much in dues this
 * year") in one call instead of hundreds of ledger fetches.
 *
 * Money aggregates are per household — the ledger's unit of account. Whole
 * indexed ranges are read and folded in memory: fine at synagogue scale
 * (thousands of entries), the same trade-off documented on dashboardStats.
 */

const METRICS = ["payments", "charges", "credits", "net"] as const;
type Metric = (typeof METRICS)[number];

const MAX_ROWS = 200;

type HouseholdFold = {
  chargedMinor: number;
  paidMinor: number;
  creditMinor: number;
  openingMinor: number;
  entryCount: number;
  firstEntryAt: string;
  lastEntryAt: string;
};

function foldEntries(
  entries: Doc<"ledgerEntries">[],
  category: string | undefined,
): Map<Id<"households">, HouseholdFold> {
  const wanted = category?.trim().toLowerCase();
  const byHousehold = new Map<Id<"households">, HouseholdFold>();
  for (const entry of entries) {
    if (wanted !== undefined && (entry.category ?? "").trim().toLowerCase() !== wanted) {
      continue;
    }
    let fold = byHousehold.get(entry.householdId);
    if (fold === undefined) {
      fold = {
        chargedMinor: 0,
        paidMinor: 0,
        creditMinor: 0,
        openingMinor: 0,
        entryCount: 0,
        firstEntryAt: entry.occurredAt,
        lastEntryAt: entry.occurredAt,
      };
      byHousehold.set(entry.householdId, fold);
    }
    switch (entry.entryType) {
      case "charge":
        fold.chargedMinor += entry.amountMinor;
        break;
      case "payment":
        fold.paidMinor += entry.amountMinor;
        break;
      case "credit":
        fold.creditMinor += entry.amountMinor;
        break;
      case "opening_balance":
        fold.openingMinor += entry.amountMinor;
        break;
    }
    fold.entryCount += 1;
    if (entry.occurredAt < fold.firstEntryAt) {
      fold.firstEntryAt = entry.occurredAt;
    }
    if (entry.occurredAt > fold.lastEntryAt) {
      fold.lastEntryAt = entry.occurredAt;
    }
  }
  return byHousehold;
}

function metricOf(fold: HouseholdFold, metric: Metric): number {
  switch (metric) {
    case "payments":
      return fold.paidMinor;
    case "charges":
      return fold.chargedMinor;
    case "credits":
      return fold.creditMinor;
    case "net":
      return fold.chargedMinor + fold.openingMinor - fold.paidMinor - fold.creditMinor;
  }
}

export const apiGivingAnalytics = internalQuery({
  args: {
    institutionId: v.id("institutions"),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    category: v.optional(v.string()),
    metric: v.union(...METRICS.map((metric) => v.literal(metric))),
    minMinor: v.optional(v.number()),
    maxMinor: v.optional(v.number()),
    order: v.union(v.literal("asc"), v.literal("desc")),
    activeOnly: v.boolean(),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("ledgerEntries")
      .withIndex("by_institution_date", (q) => {
        const scoped = q.eq("institutionId", args.institutionId);
        const lower = args.from === undefined ? scoped : scoped.gte("occurredAt", args.from);
        return args.to === undefined ? lower : lower.lte("occurredAt", args.to);
      })
      .collect();
    const folds = foldEntries(entries, args.category);

    const rows = [];
    for (const [householdId, fold] of folds) {
      const household = await ctx.db.get(householdId);
      if (household === null || household.institutionId !== args.institutionId) {
        continue;
      }
      if (args.activeOnly && !household.isActive) {
        continue;
      }
      const metricMinor = metricOf(fold, args.metric);
      if (args.minMinor !== undefined && metricMinor < args.minMinor) {
        continue;
      }
      if (args.maxMinor !== undefined && metricMinor > args.maxMinor) {
        continue;
      }
      rows.push({
        householdId,
        displayName: household.displayName,
        isActive: household.isActive,
        metricMinor,
        chargedMinor: fold.chargedMinor,
        paidMinor: fold.paidMinor,
        creditMinor: fold.creditMinor,
        openingMinor: fold.openingMinor,
        netMinor: metricOf(fold, "net"),
        entryCount: fold.entryCount,
        firstEntryAt: fold.firstEntryAt,
        lastEntryAt: fold.lastEntryAt,
      });
    }
    rows.sort((a, b) =>
      args.order === "asc" ? a.metricMinor - b.metricMinor : b.metricMinor - a.metricMinor,
    );
    const totalMetricMinor = rows.reduce((sum, row) => sum + row.metricMinor, 0);
    return {
      data: rows.slice(0, args.limit),
      summary: {
        metric: args.metric,
        matchedHouseholds: rows.length,
        returned: Math.min(rows.length, args.limit),
        totalMetricMinor,
        scannedEntries: entries.length,
      },
    };
  },
});

export const apiCategoryTotals = internalQuery({
  args: {
    institutionId: v.id("institutions"),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("ledgerEntries")
      .withIndex("by_institution_date", (q) => {
        const scoped = q.eq("institutionId", args.institutionId);
        const lower = args.from === undefined ? scoped : scoped.gte("occurredAt", args.from);
        return args.to === undefined ? lower : lower.lte("occurredAt", args.to);
      })
      .collect();

    const byCategory = new Map<
      string,
      { chargedMinor: number; paidMinor: number; creditMinor: number; entryCount: number }
    >();
    for (const entry of entries) {
      const key = entry.category?.trim() || "(uncategorized)";
      let bucket = byCategory.get(key);
      if (bucket === undefined) {
        bucket = { chargedMinor: 0, paidMinor: 0, creditMinor: 0, entryCount: 0 };
        byCategory.set(key, bucket);
      }
      if (entry.entryType === "charge") {
        bucket.chargedMinor += entry.amountMinor;
      } else if (entry.entryType === "payment") {
        bucket.paidMinor += entry.amountMinor;
      } else if (entry.entryType === "credit") {
        bucket.creditMinor += entry.amountMinor;
      }
      bucket.entryCount += 1;
    }
    const data = [...byCategory.entries()]
      .map(([category, bucket]) => ({ category, ...bucket }))
      .sort((a, b) => b.paidMinor - a.paidMinor);
    return { data, summary: { categories: data.length, scannedEntries: entries.length } };
  },
});

export const apiListCampaigns = internalQuery({
  args: { institutionId: v.id("institutions") },
  handler: async (ctx, args) => {
    const campaigns = await ctx.db
      .query("campaigns")
      .withIndex("by_institution", (q) => q.eq("institutionId", args.institutionId))
      .order("desc")
      .collect();
    const data = [];
    for (const campaign of campaigns) {
      const pledges = await campaignPledges(ctx, campaign._id);
      data.push({
        id: campaign._id,
        name: campaign.name,
        description: campaign.description,
        goalMinor: campaign.goalMinor,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
        status: campaign.status,
        createdAt: campaign._creationTime,
        rollup: rollupPledges(pledges),
      });
    }
    return { data };
  },
});

export const apiListPledges = internalQuery({
  args: {
    institutionId: v.id("institutions"),
    campaignId: v.optional(v.string()),
    stage: v.optional(pledgeStageValidator),
    openOnly: v.boolean(),
  },
  handler: async (ctx, args) => {
    let pledges: Doc<"pledges">[];
    if (args.campaignId !== undefined) {
      const campaignId = ctx.db.normalizeId("campaigns", args.campaignId);
      const campaign = campaignId === null ? null : await ctx.db.get(campaignId);
      if (campaign === null || campaign.institutionId !== args.institutionId) {
        return null;
      }
      pledges = await campaignPledges(ctx, campaign._id);
    } else {
      pledges = await ctx.db
        .query("pledges")
        .withIndex("by_institution_stage", (q) => q.eq("institutionId", args.institutionId))
        .collect();
    }
    const openStages = new Set<string>(OPEN_PLEDGE_STAGES);
    const filtered = pledges.filter((pledge) => {
      if (args.stage !== undefined && pledge.stage !== args.stage) {
        return false;
      }
      if (args.openOnly && !openStages.has(pledge.stage)) {
        return false;
      }
      return true;
    });
    const data = [];
    for (const pledge of filtered.slice(0, MAX_ROWS)) {
      data.push(await joinPledge(ctx, pledge));
    }
    data.sort((a, b) => b.updatedAt - a.updatedAt);
    return { data, summary: { matched: filtered.length, returned: data.length } };
  },
});

// --- HTTP handlers ------------------------------------------------------------

function intParam(
  url: URL,
  name: string,
  { min, max, fallback }: { min: number; max: number; fallback: number },
): number | Response {
  const raw = url.searchParams.get(name);
  if (raw === null) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    return errorResponse(400, "invalid_parameter", `${name} must be an integer in ${min}..${max}.`);
  }
  return value;
}

function optionalIntParam(url: URL, name: string): number | undefined | Response {
  const raw = url.searchParams.get(name);
  if (raw === null) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    return errorResponse(400, "invalid_parameter", `${name} must be an integer (minor units).`);
  }
  return value;
}

export const analyticsHouseholdsHandler = httpAction(async (ctx, request) => {
  const principal = await authenticate(ctx, request);
  if (principal instanceof Response) {
    return principal;
  }
  const url = new URL(request.url);
  const from = dateParam(url, "from");
  if (from instanceof Response) {
    return from;
  }
  const to = dateParam(url, "to");
  if (to instanceof Response) {
    return to;
  }
  const rawMetric = url.searchParams.get("metric") ?? "payments";
  if (!(METRICS as readonly string[]).includes(rawMetric)) {
    return errorResponse(400, "invalid_parameter", `metric must be one of: ${METRICS.join(", ")}.`);
  }
  const rawOrder = url.searchParams.get("order") ?? "desc";
  if (rawOrder !== "asc" && rawOrder !== "desc") {
    return errorResponse(400, "invalid_parameter", "order must be asc or desc.");
  }
  const minMinor = optionalIntParam(url, "min");
  if (minMinor instanceof Response) {
    return minMinor;
  }
  const maxMinor = optionalIntParam(url, "max");
  if (maxMinor instanceof Response) {
    return maxMinor;
  }
  const limit = intParam(url, "limit", { min: 1, max: MAX_ROWS, fallback: 50 });
  if (limit instanceof Response) {
    return limit;
  }
  const result = await ctx.runQuery(internal.httpApiAnalytics.apiGivingAnalytics, {
    institutionId: principal.institutionId,
    from,
    to,
    category: url.searchParams.get("category") ?? undefined,
    metric: rawMetric as Metric,
    minMinor,
    maxMinor,
    order: rawOrder,
    activeOnly: url.searchParams.get("active") === "true",
    limit,
  });
  return jsonResponse(200, result);
});

export const analyticsCategoriesHandler = httpAction(async (ctx, request) => {
  const principal = await authenticate(ctx, request);
  if (principal instanceof Response) {
    return principal;
  }
  const url = new URL(request.url);
  const from = dateParam(url, "from");
  if (from instanceof Response) {
    return from;
  }
  const to = dateParam(url, "to");
  if (to instanceof Response) {
    return to;
  }
  const result = await ctx.runQuery(internal.httpApiAnalytics.apiCategoryTotals, {
    institutionId: principal.institutionId,
    from,
    to,
  });
  return jsonResponse(200, result);
});

export const campaignsHandler = httpAction(async (ctx, request) => {
  const principal = await authenticate(ctx, request);
  if (principal instanceof Response) {
    return principal;
  }
  const result = await ctx.runQuery(internal.httpApiAnalytics.apiListCampaigns, {
    institutionId: principal.institutionId,
  });
  return jsonResponse(200, result);
});

export const pledgesHandler = httpAction(async (ctx, request) => {
  const principal = await authenticate(ctx, request);
  if (principal instanceof Response) {
    return principal;
  }
  const url = new URL(request.url);
  const rawStage = url.searchParams.get("stage") ?? undefined;
  if (rawStage !== undefined && !(PLEDGE_STAGE_SLUGS as string[]).includes(rawStage)) {
    return errorResponse(
      400,
      "invalid_parameter",
      `stage must be one of: ${PLEDGE_STAGE_SLUGS.join(", ")}.`,
    );
  }
  const result = await ctx.runQuery(internal.httpApiAnalytics.apiListPledges, {
    institutionId: principal.institutionId,
    campaignId: url.searchParams.get("campaignId") ?? undefined,
    stage: rawStage as (typeof PLEDGE_STAGE_SLUGS)[number] | undefined,
    openOnly: url.searchParams.get("open") === "true",
  });
  if (result === null) {
    return errorResponse(404, "not_found", "No such campaign.");
  }
  return jsonResponse(200, result);
});
