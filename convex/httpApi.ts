import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { httpAction, internalQuery } from "./_generated/server";
import { ledgerDelta } from "./ledger";
import { hashApiKeySecret } from "./lib/apiKeys";

/**
 * The public HTTP API, v1. Served by Convex HTTP actions on the deployment's
 * site URL, authenticated with institution-scoped API keys
 * (Authorization: Bearer ssk_...). Every handler resolves the key first and
 * scopes every read to the key's institution; IDs from other institutions
 * 404 exactly like IDs that do not exist. This file carries the read
 * endpoints and the shared plumbing; the write endpoints (gated on the
 * "write" scope) live in httpApiWrites.ts.
 */

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 50;
const LAST_USED_REFRESH_MS = 60 * 60 * 1000;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type ApiPrincipal = {
  apiKeyId: Doc<"apiKeys">["_id"];
  institutionId: Doc<"institutions">["_id"];
  scopes: string[];
  name: string;
  keyPrefix: string;
};

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse(status, { error: { code, message } });
}

export const notFound = () => errorResponse(404, "not_found", "No such resource.");

export async function authenticate(
  ctx: ActionCtx,
  request: Request,
): Promise<ApiPrincipal | Response> {
  const header = request.headers.get("Authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/.exec(header);
  if (match?.[1] === undefined) {
    return errorResponse(
      401,
      "missing_api_key",
      "Provide an API key: Authorization: Bearer ssk_...",
    );
  }
  const key = await ctx.runQuery(internal.developer.resolveApiKey, {
    keyHash: hashApiKeySecret(match[1]),
  });
  if (key === null) {
    return errorResponse(401, "invalid_api_key", "Unknown, revoked, or expired API key.");
  }
  if (key.lastUsedAt === undefined || Date.now() - key.lastUsedAt > LAST_USED_REFRESH_MS) {
    await ctx.runMutation(internal.developer.touchApiKey, { apiKeyId: key.apiKeyId });
  }
  return key;
}

/** Parse ?limit and ?cursor into Convex pagination options, or a 400. */
function paginationFromRequest(url: URL): { numItems: number; cursor: string | null } | Response {
  const rawLimit = url.searchParams.get("limit");
  let numItems = DEFAULT_PAGE_SIZE;
  if (rawLimit !== null) {
    numItems = Number(rawLimit);
    if (!Number.isInteger(numItems) || numItems < 1 || numItems > MAX_PAGE_SIZE) {
      return errorResponse(400, "invalid_limit", `limit must be 1..${MAX_PAGE_SIZE}.`);
    }
  }
  return { numItems, cursor: url.searchParams.get("cursor") };
}

/** Validate an optional ?from/?to date param, or a 400. */
export function dateParam(url: URL, name: string): string | undefined | Response {
  const value = url.searchParams.get(name);
  if (value === null) {
    return undefined;
  }
  if (!ISO_DATE_PATTERN.test(value)) {
    return errorResponse(400, "invalid_date", `${name} must be YYYY-MM-DD.`);
  }
  return value;
}

// --- DTOs ---------------------------------------------------------------------

export function householdDto(household: Doc<"households">) {
  return {
    id: household._id,
    displayName: household.displayName,
    householdType: household.householdType,
    billingAccountType: household.billingAccountType,
    isActive: household.isActive,
    addedAt: household.addedAt,
    joinedAt: household.joinedAt,
    resignedAt: household.resignedAt,
    createdAt: household._creationTime,
    updatedAt: household.updatedAt,
    metadata: household.metadata,
  };
}

export function personDto(person: Doc<"people">) {
  return {
    id: person._id,
    displayName: person.displayName,
    title: person.title,
    firstName: person.firstName,
    middleName: person.middleName,
    lastName: person.lastName,
    nickname: person.nickname,
    suffix: person.suffix,
    mailName: person.mailName,
    personType: person.personType,
    gender: person.gender,
    maritalStatus: person.maritalStatus,
    hebrewGivenName: person.hebrewGivenName,
    hebrewFatherName: person.hebrewFatherName,
    hebrewMotherName: person.hebrewMotherName,
    hebrewFamilyName: person.hebrewFamilyName,
    dateOfBirth: person.dateOfBirth,
    hebrewBirthDate: person.hebrewBirthDate,
    honoraryMember: person.honoraryMember,
    eligibleForAliyah: person.eligibleForAliyah,
    isDeceased: person.isDeceased,
    isActive: person.isActive,
    createdAt: person._creationTime,
    updatedAt: person.updatedAt,
    metadata: person.metadata,
  };
}

export function ledgerEntryDto(entry: Doc<"ledgerEntries">) {
  return {
    id: entry._id,
    householdId: entry.householdId,
    entryType: entry.entryType,
    amountMinor: entry.amountMinor,
    balanceDeltaMinor: ledgerDelta(entry.entryType, entry.amountMinor),
    occurredAt: entry.occurredAt,
    category: entry.category,
    method: entry.method,
    memo: entry.memo,
    createdAt: entry._creationTime,
    metadata: entry.metadata,
  };
}

function billingProfileDto(profile: Doc<"householdBillingProfiles"> | null) {
  if (profile === null) {
    return null;
  }
  return {
    balanceMinor: profile.balanceMinor,
    balanceAsOf: profile.balanceAsOf,
    currency: profile.currency,
    deliveryMethod: profile.deliveryMethod,
    discountNotes: profile.discountNotes,
  };
}

// --- Internal data queries (reachable only through the HTTP handlers) ---------

export const apiListHouseholds = internalQuery({
  args: {
    institutionId: v.id("institutions"),
    activeOnly: v.boolean(),
    search: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    if (args.search !== undefined) {
      const search = args.search;
      const results = await ctx.db
        .query("households")
        .withSearchIndex("search_display_name", (q) =>
          q.search("displayName", search).eq("institutionId", args.institutionId),
        )
        .take(args.paginationOpts.numItems);
      const filtered = args.activeOnly ? results.filter((row) => row.isActive) : results;
      return { page: filtered.map(householdDto), isDone: true, continueCursor: null };
    }
    const page = args.activeOnly
      ? await ctx.db
          .query("households")
          .withIndex("by_institution_active", (q) =>
            q.eq("institutionId", args.institutionId).eq("isActive", true),
          )
          .order("desc")
          .paginate(args.paginationOpts)
      : await ctx.db
          .query("households")
          .withIndex("by_institution", (q) => q.eq("institutionId", args.institutionId))
          .order("desc")
          .paginate(args.paginationOpts);
    return {
      page: page.page.map(householdDto),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export const apiGetHousehold = internalQuery({
  args: { institutionId: v.id("institutions"), id: v.string() },
  handler: async (ctx, args) => {
    const householdId = ctx.db.normalizeId("households", args.id);
    const household = householdId === null ? null : await ctx.db.get(householdId);
    if (household === null || household.institutionId !== args.institutionId) {
      return null;
    }
    const memberRows = await ctx.db
      .query("householdMembers")
      .withIndex("by_household", (q) => q.eq("householdId", household._id))
      .collect();
    const members = [];
    for (const member of memberRows) {
      const person = await ctx.db.get(member.personId);
      if (person !== null) {
        members.push({
          personId: person._id,
          displayName: person.displayName,
          role: member.role,
          isPrimaryContact: member.isPrimaryContact,
          isBillingContact: member.isBillingContact,
          isActive: member.isActive,
        });
      }
    }
    const profile = await ctx.db
      .query("householdBillingProfiles")
      .withIndex("by_household", (q) => q.eq("householdId", household._id))
      .unique();
    return { ...householdDto(household), members, billingProfile: billingProfileDto(profile) };
  },
});

export const apiHouseholdLedger = internalQuery({
  args: {
    institutionId: v.id("institutions"),
    id: v.string(),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const householdId = ctx.db.normalizeId("households", args.id);
    const household = householdId === null ? null : await ctx.db.get(householdId);
    if (household === null || household.institutionId !== args.institutionId) {
      return null;
    }
    const page = await ctx.db
      .query("ledgerEntries")
      .withIndex("by_household_date", (q) => {
        const scoped = q.eq("householdId", household._id);
        const lower = args.from === undefined ? scoped : scoped.gte("occurredAt", args.from);
        return args.to === undefined ? lower : lower.lte("occurredAt", args.to);
      })
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      page: page.page.map(ledgerEntryDto),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export const apiListPeople = internalQuery({
  args: {
    institutionId: v.id("institutions"),
    activeOnly: v.boolean(),
    search: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    if (args.search !== undefined) {
      const search = args.search;
      const results = await ctx.db
        .query("people")
        .withSearchIndex("search_display_name", (q) =>
          q.search("displayName", search).eq("institutionId", args.institutionId),
        )
        .take(args.paginationOpts.numItems);
      const filtered = args.activeOnly ? results.filter((row) => row.isActive) : results;
      return { page: filtered.map(personDto), isDone: true, continueCursor: null };
    }
    const page = args.activeOnly
      ? await ctx.db
          .query("people")
          .withIndex("by_institution_active", (q) =>
            q.eq("institutionId", args.institutionId).eq("isActive", true),
          )
          .order("desc")
          .paginate(args.paginationOpts)
      : await ctx.db
          .query("people")
          .withIndex("by_institution", (q) => q.eq("institutionId", args.institutionId))
          .order("desc")
          .paginate(args.paginationOpts);
    return {
      page: page.page.map(personDto),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export const apiGetPerson = internalQuery({
  args: { institutionId: v.id("institutions"), id: v.string() },
  handler: async (ctx, args) => {
    const personId = ctx.db.normalizeId("people", args.id);
    const person = personId === null ? null : await ctx.db.get(personId);
    if (person === null || person.institutionId !== args.institutionId) {
      return null;
    }
    const membershipRows = await ctx.db
      .query("householdMembers")
      .withIndex("by_person", (q) => q.eq("personId", person._id))
      .collect();
    const memberships = [];
    for (const membership of membershipRows) {
      const household = await ctx.db.get(membership.householdId);
      if (household !== null) {
        memberships.push({
          householdId: household._id,
          householdName: household.displayName,
          role: membership.role,
          isActive: membership.isActive,
        });
      }
    }
    return { ...personDto(person), memberships };
  },
});

export const apiListTransactions = internalQuery({
  args: {
    institutionId: v.id("institutions"),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("ledgerEntries")
      .withIndex("by_institution_date", (q) => {
        const scoped = q.eq("institutionId", args.institutionId);
        const lower = args.from === undefined ? scoped : scoped.gte("occurredAt", args.from);
        return args.to === undefined ? lower : lower.lte("occurredAt", args.to);
      })
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      page: page.page.map(ledgerEntryDto),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export const apiSummary = internalQuery({
  args: { institutionId: v.id("institutions") },
  handler: async (ctx, args) => {
    const [households, people, profiles] = await Promise.all([
      ctx.db
        .query("households")
        .withIndex("by_institution_active", (q) =>
          q.eq("institutionId", args.institutionId).eq("isActive", true),
        )
        .collect(),
      ctx.db
        .query("people")
        .withIndex("by_institution_active", (q) =>
          q.eq("institutionId", args.institutionId).eq("isActive", true),
        )
        .collect(),
      ctx.db
        .query("householdBillingProfiles")
        .withIndex("by_institution", (q) => q.eq("institutionId", args.institutionId))
        .collect(),
    ]);
    let outstandingMinor = 0;
    let creditMinor = 0;
    for (const profile of profiles) {
      if (profile.balanceMinor > 0) {
        outstandingMinor += profile.balanceMinor;
      } else {
        creditMinor += -profile.balanceMinor;
      }
    }
    return {
      activeHouseholds: households.length,
      activePeople: people.length,
      billingProfiles: profiles.length,
      outstandingMinor,
      creditMinor,
    };
  },
});

// --- HTTP handlers ------------------------------------------------------------

export const meHandler = httpAction(async (ctx, request) => {
  const principal = await authenticate(ctx, request);
  if (principal instanceof Response) {
    return principal;
  }
  return jsonResponse(200, {
    data: {
      keyName: principal.name,
      institutionId: principal.institutionId,
      scopes: principal.scopes,
    },
  });
});

export const summaryHandler = httpAction(async (ctx, request) => {
  const principal = await authenticate(ctx, request);
  if (principal instanceof Response) {
    return principal;
  }
  const data = await ctx.runQuery(internal.httpApi.apiSummary, {
    institutionId: principal.institutionId,
  });
  return jsonResponse(200, { data });
});

function listParams(url: URL) {
  return {
    activeOnly: url.searchParams.get("active") === "true",
    search: url.searchParams.get("search") ?? undefined,
  };
}

export const householdsHandler = httpAction(async (ctx, request) => {
  const principal = await authenticate(ctx, request);
  if (principal instanceof Response) {
    return principal;
  }
  const url = new URL(request.url);
  const paginationOpts = paginationFromRequest(url);
  if (paginationOpts instanceof Response) {
    return paginationOpts;
  }
  const result = await ctx.runQuery(internal.httpApi.apiListHouseholds, {
    institutionId: principal.institutionId,
    ...listParams(url),
    paginationOpts,
  });
  return jsonResponse(200, {
    data: result.page,
    cursor: result.isDone ? null : result.continueCursor,
  });
});

/** Routes /api/v1/households/:id and /api/v1/households/:id/ledger. */
export const householdByIdHandler = httpAction(async (ctx, request) => {
  const principal = await authenticate(ctx, request);
  if (principal instanceof Response) {
    return principal;
  }
  const url = new URL(request.url);
  const segments = url.pathname.replace(/^\/api\/v1\/households\//, "").split("/");
  const id = segments[0] ?? "";
  if (id === "" || segments.length > 2 || (segments.length === 2 && segments[1] !== "ledger")) {
    return notFound();
  }

  if (segments.length === 2) {
    const paginationOpts = paginationFromRequest(url);
    if (paginationOpts instanceof Response) {
      return paginationOpts;
    }
    const from = dateParam(url, "from");
    if (from instanceof Response) {
      return from;
    }
    const to = dateParam(url, "to");
    if (to instanceof Response) {
      return to;
    }
    const result = await ctx.runQuery(internal.httpApi.apiHouseholdLedger, {
      institutionId: principal.institutionId,
      id,
      from,
      to,
      paginationOpts,
    });
    if (result === null) {
      return notFound();
    }
    return jsonResponse(200, {
      data: result.page,
      cursor: result.isDone ? null : result.continueCursor,
    });
  }

  const household = await ctx.runQuery(internal.httpApi.apiGetHousehold, {
    institutionId: principal.institutionId,
    id,
  });
  if (household === null) {
    return notFound();
  }
  return jsonResponse(200, { data: household });
});

export const peopleHandler = httpAction(async (ctx, request) => {
  const principal = await authenticate(ctx, request);
  if (principal instanceof Response) {
    return principal;
  }
  const url = new URL(request.url);
  const paginationOpts = paginationFromRequest(url);
  if (paginationOpts instanceof Response) {
    return paginationOpts;
  }
  const result = await ctx.runQuery(internal.httpApi.apiListPeople, {
    institutionId: principal.institutionId,
    ...listParams(url),
    paginationOpts,
  });
  return jsonResponse(200, {
    data: result.page,
    cursor: result.isDone ? null : result.continueCursor,
  });
});

export const personByIdHandler = httpAction(async (ctx, request) => {
  const principal = await authenticate(ctx, request);
  if (principal instanceof Response) {
    return principal;
  }
  const url = new URL(request.url);
  const id = url.pathname.replace(/^\/api\/v1\/people\//, "");
  if (id === "" || id.includes("/")) {
    return notFound();
  }
  const person = await ctx.runQuery(internal.httpApi.apiGetPerson, {
    institutionId: principal.institutionId,
    id,
  });
  if (person === null) {
    return notFound();
  }
  return jsonResponse(200, { data: person });
});

export const transactionsHandler = httpAction(async (ctx, request) => {
  const principal = await authenticate(ctx, request);
  if (principal instanceof Response) {
    return principal;
  }
  const url = new URL(request.url);
  const paginationOpts = paginationFromRequest(url);
  if (paginationOpts instanceof Response) {
    return paginationOpts;
  }
  const from = dateParam(url, "from");
  if (from instanceof Response) {
    return from;
  }
  const to = dateParam(url, "to");
  if (to instanceof Response) {
    return to;
  }
  const result = await ctx.runQuery(internal.httpApi.apiListTransactions, {
    institutionId: principal.institutionId,
    from,
    to,
    paginationOpts,
  });
  return jsonResponse(200, {
    data: result.page,
    cursor: result.isDone ? null : result.continueCursor,
  });
});
