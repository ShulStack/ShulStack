import { buildPersonDisplayName } from "@shulstack/platform";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { httpAction, internalMutation } from "./_generated/server";
import { personFields, pruneUndefined } from "./crm";
import {
  type ApiPrincipal,
  authenticate,
  errorResponse,
  householdDto,
  jsonResponse,
  ledgerEntryDto,
  notFound,
  personDto,
} from "./httpApi";
import { recordLedgerEntry } from "./ledger";
import { logAudit } from "./lib/audit";
import { emitDomainEvent } from "./lib/domainEvents";
import {
  assertIsoDate,
  householdMemberRoleValidator,
  isoDate,
  optionalIsoDate,
} from "./lib/validators";

/**
 * The write half of the HTTP API, v1: POST/PATCH endpoints gated on the
 * "write" API-key scope. Handlers authenticate, check the scope, validate the
 * JSON body (400 invalid_body), and then call internal mutations that mirror
 * the staff-facing crm.ts / ledger.ts mutations: same trimming, the same
 * cross-institution guards (mismatches 404 exactly like missing IDs), the
 * same audit entries (with the acting key's prefix instead of a user), and
 * the same domain events. Ledger writes go through recordLedgerEntry — the
 * only code path allowed to move balances.
 */

// --- Scope + body plumbing ----------------------------------------------------

function requireWriteScope(principal: ApiPrincipal): Response | null {
  if (!principal.scopes.includes("write")) {
    return errorResponse(
      403,
      "insufficient_scope",
      'This API key is read-only. Writing requires a key with the "write" scope.',
    );
  }
  return null;
}

const invalidBody = (message: string) => errorResponse(400, "invalid_body", message);

/** Thrown by the field helpers below; always caught and turned into a 400. */
class InvalidBodyError extends Error {}

async function readJsonObject(request: Request): Promise<Record<string, unknown> | Response> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return invalidBody("Request body must be valid JSON.");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return invalidBody("Request body must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

/** Run a body parser, converting InvalidBodyError into a 400 response. */
function parseBody<T>(
  body: Record<string, unknown>,
  parse: (body: Record<string, unknown>) => T,
): T | Response {
  try {
    return parse(body);
  } catch (error) {
    if (error instanceof InvalidBodyError) {
      return invalidBody(error.message);
    }
    throw error;
  }
}

/** Reject unknown fields so typos fail loudly instead of vanishing. */
function assertKnownFields(body: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) {
      throw new InvalidBodyError(`Unknown field ${JSON.stringify(key)}.`);
    }
  }
}

function stringField(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new InvalidBodyError(`${key} must be a string.`);
  }
  return value;
}

function booleanField(body: Record<string, unknown>, key: string): boolean | undefined {
  const value = body[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new InvalidBodyError(`${key} must be a boolean.`);
  }
  return value;
}

function isoDateField(body: Record<string, unknown>, key: string): string | undefined {
  const value = stringField(body, key);
  if (value !== undefined) {
    try {
      assertIsoDate(value);
    } catch {
      throw new InvalidBodyError(`${key} must be a real calendar date in YYYY-MM-DD format.`);
    }
  }
  return value;
}

function enumField<T extends string>(
  body: Record<string, unknown>,
  key: string,
  values: readonly T[],
): T | undefined {
  const value = stringField(body, key);
  if (value === undefined) {
    return undefined;
  }
  if (!(values as readonly string[]).includes(value)) {
    throw new InvalidBodyError(`${key} must be one of: ${values.join(", ")}.`);
  }
  return value as T;
}

const GENDER_VALUES = ["male", "female", "nonbinary", "unknown"] as const;
const MEMBER_ROLE_VALUES = ["head", "spouse", "child", "dependent_adult", "other"] as const;
const WRITABLE_ENTRY_TYPES = ["charge", "payment", "credit"] as const;

const PERSON_BODY_FIELDS = [
  "title",
  "firstName",
  "middleName",
  "lastName",
  "nickname",
  "suffix",
  "mailName",
  "personType",
  "gender",
  "maritalStatus",
  "hebrewGivenName",
  "hebrewFatherName",
  "hebrewMotherName",
  "hebrewFamilyName",
  "dateOfBirth",
  "hebrewBirthDate",
] as const;

/** The person fields shared by POST and PATCH, typed to match crm.personFields. */
function parsePersonFields(body: Record<string, unknown>) {
  return {
    title: stringField(body, "title"),
    firstName: stringField(body, "firstName"),
    middleName: stringField(body, "middleName"),
    lastName: stringField(body, "lastName"),
    nickname: stringField(body, "nickname"),
    suffix: stringField(body, "suffix"),
    mailName: stringField(body, "mailName"),
    personType: stringField(body, "personType"),
    gender: enumField(body, "gender", GENDER_VALUES),
    maritalStatus: stringField(body, "maritalStatus"),
    hebrewGivenName: stringField(body, "hebrewGivenName"),
    hebrewFatherName: stringField(body, "hebrewFatherName"),
    hebrewMotherName: stringField(body, "hebrewMotherName"),
    hebrewFamilyName: stringField(body, "hebrewFamilyName"),
    dateOfBirth: isoDateField(body, "dateOfBirth"),
    hebrewBirthDate: stringField(body, "hebrewBirthDate"),
  };
}

function memberDto(member: Doc<"householdMembers">) {
  return {
    id: member._id,
    householdId: member.householdId,
    personId: member.personId,
    role: member.role,
    isPrimaryContact: member.isPrimaryContact,
    isBillingContact: member.isBillingContact,
    isMailRecipient: member.isMailRecipient,
    isActive: member.isActive,
    createdAt: member._creationTime,
    updatedAt: member.updatedAt,
  };
}

// --- Internal write mutations (reachable only through the HTTP handlers) ------
// Tenancy contract: every string id resolves via normalizeId and must match
// the key's institution; any mismatch returns null and the handler 404s, so
// other institutions' ids are indistinguishable from missing ones.

export const apiCreateHousehold = internalMutation({
  args: {
    institutionId: v.id("institutions"),
    viaApiKey: v.string(),
    displayName: v.string(),
    householdType: v.optional(v.string()),
    joinedAt: optionalIsoDate,
  },
  handler: async (ctx, args) => {
    const displayName = args.displayName.trim();
    const householdId = await ctx.db.insert("households", {
      institutionId: args.institutionId,
      displayName,
      householdType: args.householdType,
      joinedAt: args.joinedAt,
      isActive: true,
      metadata: {},
      updatedAt: Date.now(),
    });
    await logAudit(ctx, {
      institutionId: args.institutionId,
      entityType: "household",
      entityId: householdId,
      action: "create",
      after: { displayName, viaApiKey: args.viaApiKey },
    });
    await emitDomainEvent(ctx, {
      institutionId: args.institutionId,
      eventName: "household.created",
      payload: { householdId },
    });
    const created = await ctx.db.get(householdId);
    if (created === null) {
      throw new Error("unreachable: household just inserted");
    }
    return householdDto(created);
  },
});

export const apiUpdateHousehold = internalMutation({
  args: {
    institutionId: v.id("institutions"),
    viaApiKey: v.string(),
    id: v.string(),
    displayName: v.optional(v.string()),
    householdType: v.optional(v.string()),
    billingAccountType: v.optional(v.string()),
    mailLabel: v.optional(v.string()),
    billingMailLabel: v.optional(v.string()),
    joinedAt: optionalIsoDate,
    resignedAt: optionalIsoDate,
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const householdId = ctx.db.normalizeId("households", args.id);
    const household = householdId === null ? null : await ctx.db.get(householdId);
    if (household === null || household.institutionId !== args.institutionId) {
      return null;
    }
    const { institutionId: _institutionId, viaApiKey, id: _id, ...updates } = args;
    const changes = pruneUndefined({ ...updates, displayName: updates.displayName?.trim() });
    await ctx.db.patch(household._id, { ...changes, updatedAt: Date.now() });
    await logAudit(ctx, {
      institutionId: household.institutionId,
      entityType: "household",
      entityId: household._id,
      action: "update",
      before: { displayName: household.displayName },
      after: { ...changes, viaApiKey },
    });
    await emitDomainEvent(ctx, {
      institutionId: household.institutionId,
      eventName: "household.updated",
      payload: { householdId: household._id },
    });
    const updated = await ctx.db.get(household._id);
    if (updated === null) {
      throw new Error("unreachable: household just patched");
    }
    return householdDto(updated);
  },
});

export const apiCreatePerson = internalMutation({
  args: {
    institutionId: v.id("institutions"),
    viaApiKey: v.string(),
    ...personFields,
  },
  handler: async (ctx, args) => {
    const { viaApiKey, ...person } = args;
    const displayName = buildPersonDisplayName(person);
    const personId = await ctx.db.insert("people", {
      ...pruneUndefined(person),
      institutionId: args.institutionId,
      displayName,
      gender: args.gender ?? "unknown",
      honoraryMember: false,
      eligibleForAliyah: true,
      isDeceased: false,
      isActive: true,
      metadata: {},
      updatedAt: Date.now(),
    });
    await logAudit(ctx, {
      institutionId: args.institutionId,
      entityType: "person",
      entityId: personId,
      action: "create",
      after: { displayName, viaApiKey },
    });
    const created = await ctx.db.get(personId);
    if (created === null) {
      throw new Error("unreachable: person just inserted");
    }
    return personDto(created);
  },
});

export const apiUpdatePerson = internalMutation({
  args: {
    institutionId: v.id("institutions"),
    viaApiKey: v.string(),
    id: v.string(),
    ...personFields,
    honoraryMember: v.optional(v.boolean()),
    eligibleForAliyah: v.optional(v.boolean()),
    isDeceased: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const personId = ctx.db.normalizeId("people", args.id);
    const person = personId === null ? null : await ctx.db.get(personId);
    if (person === null || person.institutionId !== args.institutionId) {
      return null;
    }
    const { institutionId: _institutionId, viaApiKey, id: _id, ...updates } = args;
    const changes = pruneUndefined(updates);
    const merged = { ...person, ...changes };
    await ctx.db.patch(person._id, {
      ...changes,
      displayName: buildPersonDisplayName(merged),
      updatedAt: Date.now(),
    });
    await logAudit(ctx, {
      institutionId: person.institutionId,
      entityType: "person",
      entityId: person._id,
      action: "update",
      before: { displayName: person.displayName },
      after: { ...changes, viaApiKey },
    });
    const updated = await ctx.db.get(person._id);
    if (updated === null) {
      throw new Error("unreachable: person just patched");
    }
    return personDto(updated);
  },
});

export const apiAddHouseholdMember = internalMutation({
  args: {
    institutionId: v.id("institutions"),
    viaApiKey: v.string(),
    id: v.string(),
    personId: v.string(),
    role: v.optional(householdMemberRoleValidator),
    isPrimaryContact: v.optional(v.boolean()),
    isBillingContact: v.optional(v.boolean()),
    isMailRecipient: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const householdId = ctx.db.normalizeId("households", args.id);
    const household = householdId === null ? null : await ctx.db.get(householdId);
    if (household === null || household.institutionId !== args.institutionId) {
      return null;
    }
    // Same guard as crm.addHouseholdMember: a person from another institution
    // is treated exactly like a person that does not exist.
    const personId = ctx.db.normalizeId("people", args.personId);
    const person = personId === null ? null : await ctx.db.get(personId);
    if (person === null || person.institutionId !== args.institutionId) {
      return null;
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("householdMembers")
      .withIndex("by_household_person", (q) =>
        q.eq("householdId", household._id).eq("personId", person._id),
      )
      .unique();
    let membershipId: Id<"householdMembers">;
    if (existing !== null) {
      membershipId = existing._id;
      await ctx.db.patch(existing._id, {
        role: args.role ?? existing.role,
        isActive: true,
        updatedAt: now,
      });
    } else {
      membershipId = await ctx.db.insert("householdMembers", {
        institutionId: household.institutionId,
        householdId: household._id,
        personId: person._id,
        role: args.role ?? "other",
        isPrimaryContact: args.isPrimaryContact ?? false,
        isBillingContact: args.isBillingContact ?? false,
        isMailRecipient: args.isMailRecipient ?? false,
        isActive: true,
        sortOrder: 0,
        metadata: {},
        updatedAt: now,
      });
    }
    await logAudit(ctx, {
      institutionId: household.institutionId,
      entityType: "householdMember",
      entityId: `${household._id}:${person._id}`,
      action: existing === null ? "create" : "update",
      after: { role: args.role ?? "other", viaApiKey: args.viaApiKey },
    });
    await emitDomainEvent(ctx, {
      institutionId: household.institutionId,
      eventName: "membership.changed",
      payload: { householdId: household._id, personId: person._id },
    });
    const member = await ctx.db.get(membershipId);
    if (member === null) {
      throw new Error("unreachable: membership just written");
    }
    return memberDto(member);
  },
});

export const apiAddLedgerEntry = internalMutation({
  args: {
    institutionId: v.id("institutions"),
    viaApiKey: v.string(),
    id: v.string(),
    entryType: v.union(v.literal("charge"), v.literal("payment"), v.literal("credit")),
    amountMinor: v.number(),
    occurredAt: isoDate,
    category: v.optional(v.string()),
    method: v.optional(v.string()),
    memo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const householdId = ctx.db.normalizeId("households", args.id);
    const household = householdId === null ? null : await ctx.db.get(householdId);
    if (household === null || household.institutionId !== args.institutionId) {
      return null;
    }
    // The ledger is the only writer of balances: recordLedgerEntry inserts
    // the entry and moves the billing-profile balance atomically.
    const entryId = await recordLedgerEntry(ctx, household, {
      entryType: args.entryType,
      amountMinor: args.amountMinor,
      occurredAt: args.occurredAt,
      category: args.category,
      method: args.method,
      memo: args.memo,
    });
    await logAudit(ctx, {
      institutionId: household.institutionId,
      entityType: "ledgerEntry",
      entityId: entryId,
      action: "create",
      after: {
        entryType: args.entryType,
        amountMinor: args.amountMinor,
        occurredAt: args.occurredAt,
        viaApiKey: args.viaApiKey,
      },
    });
    await emitDomainEvent(ctx, {
      institutionId: household.institutionId,
      eventName: args.entryType === "payment" ? "payment.recorded" : "ledger.entry.recorded",
      payload: {
        householdId: household._id,
        entryType: args.entryType,
        amountMinor: args.amountMinor,
      },
    });
    const entry = await ctx.db.get(entryId);
    if (entry === null) {
      throw new Error("unreachable: ledger entry just inserted");
    }
    return ledgerEntryDto(entry);
  },
});

// --- HTTP handlers ------------------------------------------------------------

export const createHouseholdHandler = httpAction(async (ctx, request) => {
  const principal = await authenticate(ctx, request);
  if (principal instanceof Response) {
    return principal;
  }
  const denied = requireWriteScope(principal);
  if (denied !== null) {
    return denied;
  }
  const body = await readJsonObject(request);
  if (body instanceof Response) {
    return body;
  }
  const parsed = parseBody(body, (fields) => {
    assertKnownFields(fields, ["displayName", "householdType", "joinedAt"]);
    const displayName = stringField(fields, "displayName")?.trim();
    if (displayName === undefined || displayName === "") {
      throw new InvalidBodyError("displayName is required and cannot be empty.");
    }
    return {
      displayName,
      householdType: stringField(fields, "householdType"),
      joinedAt: isoDateField(fields, "joinedAt"),
    };
  });
  if (parsed instanceof Response) {
    return parsed;
  }
  const data = await ctx.runMutation(internal.httpApiWrites.apiCreateHousehold, {
    institutionId: principal.institutionId,
    viaApiKey: principal.keyPrefix,
    ...parsed,
  });
  return jsonResponse(201, { data });
});

export const updateHouseholdHandler = httpAction(async (ctx, request) => {
  const principal = await authenticate(ctx, request);
  if (principal instanceof Response) {
    return principal;
  }
  const denied = requireWriteScope(principal);
  if (denied !== null) {
    return denied;
  }
  const url = new URL(request.url);
  const segments = url.pathname.replace(/^\/api\/v1\/households\//, "").split("/");
  const id = segments[0] ?? "";
  if (id === "" || segments.length !== 1) {
    return notFound();
  }
  const body = await readJsonObject(request);
  if (body instanceof Response) {
    return body;
  }
  const parsed = parseBody(body, (fields) => {
    assertKnownFields(fields, [
      "displayName",
      "householdType",
      "billingAccountType",
      "mailLabel",
      "billingMailLabel",
      "joinedAt",
      "resignedAt",
      "isActive",
    ]);
    const displayName = stringField(fields, "displayName");
    if (displayName !== undefined && displayName.trim() === "") {
      throw new InvalidBodyError("displayName cannot be empty.");
    }
    return {
      displayName,
      householdType: stringField(fields, "householdType"),
      billingAccountType: stringField(fields, "billingAccountType"),
      mailLabel: stringField(fields, "mailLabel"),
      billingMailLabel: stringField(fields, "billingMailLabel"),
      joinedAt: isoDateField(fields, "joinedAt"),
      resignedAt: isoDateField(fields, "resignedAt"),
      isActive: booleanField(fields, "isActive"),
    };
  });
  if (parsed instanceof Response) {
    return parsed;
  }
  const data = await ctx.runMutation(internal.httpApiWrites.apiUpdateHousehold, {
    institutionId: principal.institutionId,
    viaApiKey: principal.keyPrefix,
    id,
    ...parsed,
  });
  if (data === null) {
    return notFound();
  }
  return jsonResponse(200, { data });
});

export const createPersonHandler = httpAction(async (ctx, request) => {
  const principal = await authenticate(ctx, request);
  if (principal instanceof Response) {
    return principal;
  }
  const denied = requireWriteScope(principal);
  if (denied !== null) {
    return denied;
  }
  const body = await readJsonObject(request);
  if (body instanceof Response) {
    return body;
  }
  const parsed = parseBody(body, (fields) => {
    assertKnownFields(fields, PERSON_BODY_FIELDS);
    return parsePersonFields(fields);
  });
  if (parsed instanceof Response) {
    return parsed;
  }
  const data = await ctx.runMutation(internal.httpApiWrites.apiCreatePerson, {
    institutionId: principal.institutionId,
    viaApiKey: principal.keyPrefix,
    ...parsed,
  });
  return jsonResponse(201, { data });
});

export const updatePersonHandler = httpAction(async (ctx, request) => {
  const principal = await authenticate(ctx, request);
  if (principal instanceof Response) {
    return principal;
  }
  const denied = requireWriteScope(principal);
  if (denied !== null) {
    return denied;
  }
  const url = new URL(request.url);
  const id = url.pathname.replace(/^\/api\/v1\/people\//, "");
  if (id === "" || id.includes("/")) {
    return notFound();
  }
  const body = await readJsonObject(request);
  if (body instanceof Response) {
    return body;
  }
  const parsed = parseBody(body, (fields) => {
    assertKnownFields(fields, [
      ...PERSON_BODY_FIELDS,
      "honoraryMember",
      "eligibleForAliyah",
      "isDeceased",
      "isActive",
    ]);
    return {
      ...parsePersonFields(fields),
      honoraryMember: booleanField(fields, "honoraryMember"),
      eligibleForAliyah: booleanField(fields, "eligibleForAliyah"),
      isDeceased: booleanField(fields, "isDeceased"),
      isActive: booleanField(fields, "isActive"),
    };
  });
  if (parsed instanceof Response) {
    return parsed;
  }
  const data = await ctx.runMutation(internal.httpApiWrites.apiUpdatePerson, {
    institutionId: principal.institutionId,
    viaApiKey: principal.keyPrefix,
    id,
    ...parsed,
  });
  if (data === null) {
    return notFound();
  }
  return jsonResponse(200, { data });
});

/** Routes POST /api/v1/households/:id/members and /api/v1/households/:id/ledger. */
export const householdSubresourceHandler = httpAction(async (ctx, request) => {
  const principal = await authenticate(ctx, request);
  if (principal instanceof Response) {
    return principal;
  }
  const denied = requireWriteScope(principal);
  if (denied !== null) {
    return denied;
  }
  const url = new URL(request.url);
  const segments = url.pathname.replace(/^\/api\/v1\/households\//, "").split("/");
  const id = segments[0] ?? "";
  const subresource = segments[1];
  if (id === "" || segments.length !== 2) {
    return notFound();
  }
  const body = await readJsonObject(request);
  if (body instanceof Response) {
    return body;
  }

  if (subresource === "members") {
    const parsed = parseBody(body, (fields) => {
      assertKnownFields(fields, [
        "personId",
        "role",
        "isPrimaryContact",
        "isBillingContact",
        "isMailRecipient",
      ]);
      const personId = stringField(fields, "personId");
      if (personId === undefined || personId === "") {
        throw new InvalidBodyError("personId is required.");
      }
      return {
        personId,
        role: enumField(fields, "role", MEMBER_ROLE_VALUES),
        isPrimaryContact: booleanField(fields, "isPrimaryContact"),
        isBillingContact: booleanField(fields, "isBillingContact"),
        isMailRecipient: booleanField(fields, "isMailRecipient"),
      };
    });
    if (parsed instanceof Response) {
      return parsed;
    }
    const data = await ctx.runMutation(internal.httpApiWrites.apiAddHouseholdMember, {
      institutionId: principal.institutionId,
      viaApiKey: principal.keyPrefix,
      id,
      ...parsed,
    });
    if (data === null) {
      return notFound();
    }
    return jsonResponse(201, { data });
  }

  if (subresource === "ledger") {
    const parsed = parseBody(body, (fields) => {
      assertKnownFields(fields, [
        "entryType",
        "amountMinor",
        "occurredAt",
        "category",
        "method",
        "memo",
      ]);
      const entryType = enumField(fields, "entryType", WRITABLE_ENTRY_TYPES);
      if (entryType === undefined) {
        throw new InvalidBodyError(
          `entryType is required and must be one of: ${WRITABLE_ENTRY_TYPES.join(", ")}.`,
        );
      }
      const amountMinor = fields.amountMinor;
      if (
        typeof amountMinor !== "number" ||
        !Number.isSafeInteger(amountMinor) ||
        amountMinor <= 0
      ) {
        throw new InvalidBodyError(
          "amountMinor must be a positive integer in minor units (e.g. cents).",
        );
      }
      const occurredAt = isoDateField(fields, "occurredAt");
      if (occurredAt === undefined) {
        throw new InvalidBodyError("occurredAt is required (YYYY-MM-DD).");
      }
      return {
        entryType,
        amountMinor,
        occurredAt,
        category: stringField(fields, "category"),
        method: stringField(fields, "method"),
        memo: stringField(fields, "memo"),
      };
    });
    if (parsed instanceof Response) {
      return parsed;
    }
    const data = await ctx.runMutation(internal.httpApiWrites.apiAddLedgerEntry, {
      institutionId: principal.institutionId,
      viaApiKey: principal.keyPrefix,
      id,
      ...parsed,
    });
    if (data === null) {
      return notFound();
    }
    return jsonResponse(201, { data });
  }

  return notFound();
});
