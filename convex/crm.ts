import { buildPersonDisplayName } from "@shulstack/platform";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireStaff } from "./lib/access";
import { logAudit } from "./lib/audit";
import { emitDomainEvent } from "./lib/domainEvents";
import {
  genderValidator,
  householdMemberRoleValidator,
  metadataValidator,
  optionalIsoDate,
} from "./lib/validators";

// --- Households --------------------------------------------------------------

export const listHouseholds = query({
  args: {
    institutionId: v.id("institutions"),
    activeOnly: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx, args.institutionId);
    if (args.activeOnly === true) {
      return await ctx.db
        .query("households")
        .withIndex("by_institution_active", (q) =>
          q.eq("institutionId", args.institutionId).eq("isActive", true),
        )
        .order("desc")
        .paginate(args.paginationOpts);
    }
    return await ctx.db
      .query("households")
      .withIndex("by_institution", (q) => q.eq("institutionId", args.institutionId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const searchHouseholds = query({
  args: {
    institutionId: v.id("institutions"),
    query: v.string(),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx, args.institutionId);
    if (args.query.trim() === "") {
      return [];
    }
    return await ctx.db
      .query("households")
      .withSearchIndex("search_display_name", (q) =>
        q.search("displayName", args.query).eq("institutionId", args.institutionId),
      )
      .take(20);
  },
});

/** A household with its members (joined to people) and billing profile. */
export const getHousehold = query({
  args: { householdId: v.id("households") },
  handler: async (ctx, args) => {
    const household = await ctx.db.get(args.householdId);
    if (household === null) {
      return null;
    }
    await requireStaff(ctx, household.institutionId);

    const memberRows = await ctx.db
      .query("householdMembers")
      .withIndex("by_household", (q) => q.eq("householdId", args.householdId))
      .collect();
    const members = [];
    for (const member of memberRows) {
      const person = await ctx.db.get(member.personId);
      if (person !== null) {
        members.push({
          membershipId: member._id,
          personId: person._id,
          displayName: person.displayName,
          role: member.role,
          isPrimaryContact: member.isPrimaryContact,
          isBillingContact: member.isBillingContact,
          isActive: member.isActive,
        });
      }
    }
    members.sort((a, b) => Number(b.isActive) - Number(a.isActive));

    const billingProfile = await ctx.db
      .query("householdBillingProfiles")
      .withIndex("by_household", (q) => q.eq("householdId", args.householdId))
      .unique();

    return { household, members, billingProfile };
  },
});

export const createHousehold = mutation({
  args: {
    institutionId: v.id("institutions"),
    displayName: v.string(),
    householdType: v.optional(v.string()),
    joinedAt: optionalIsoDate,
    metadata: v.optional(metadataValidator),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireStaff(ctx, args.institutionId);
    const displayName = args.displayName.trim();
    if (displayName === "") {
      throw new ConvexError("Household name is required.");
    }
    const householdId = await ctx.db.insert("households", {
      institutionId: args.institutionId,
      displayName,
      householdType: args.householdType,
      joinedAt: args.joinedAt,
      isActive: true,
      metadata: args.metadata ?? {},
      updatedAt: Date.now(),
    });
    await logAudit(ctx, {
      institutionId: args.institutionId,
      actorUserId: userId,
      entityType: "household",
      entityId: householdId,
      action: "create",
      after: { displayName },
    });
    await emitDomainEvent(ctx, {
      institutionId: args.institutionId,
      eventName: "household.created",
      payload: { householdId },
    });
    return householdId;
  },
});

export const updateHousehold = mutation({
  args: {
    householdId: v.id("households"),
    displayName: v.optional(v.string()),
    householdType: v.optional(v.string()),
    billingAccountType: v.optional(v.string()),
    mailLabel: v.optional(v.string()),
    billingMailLabel: v.optional(v.string()),
    joinedAt: optionalIsoDate,
    resignedAt: optionalIsoDate,
  },
  handler: async (ctx, args) => {
    const household = await ctx.db.get(args.householdId);
    if (household === null) {
      throw new ConvexError("Household not found.");
    }
    const { userId } = await requireStaff(ctx, household.institutionId);
    const { householdId, ...updates } = args;
    const displayName = updates.displayName?.trim();
    if (displayName === "") {
      throw new ConvexError("Household name cannot be empty.");
    }
    await ctx.db.patch(householdId, {
      ...pruneUndefined({ ...updates, displayName }),
      updatedAt: Date.now(),
    });
    await logAudit(ctx, {
      institutionId: household.institutionId,
      actorUserId: userId,
      entityType: "household",
      entityId: householdId,
      action: "update",
      before: { displayName: household.displayName },
      after: pruneUndefined({ ...updates, displayName }),
    });
    await emitDomainEvent(ctx, {
      institutionId: household.institutionId,
      eventName: "household.updated",
      payload: { householdId },
    });
  },
});

export const setHouseholdActive = mutation({
  args: {
    householdId: v.id("households"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const household = await ctx.db.get(args.householdId);
    if (household === null) {
      throw new ConvexError("Household not found.");
    }
    const { userId } = await requireStaff(ctx, household.institutionId);
    await ctx.db.patch(args.householdId, { isActive: args.isActive, updatedAt: Date.now() });
    await logAudit(ctx, {
      institutionId: household.institutionId,
      actorUserId: userId,
      entityType: "household",
      entityId: args.householdId,
      action: "update",
      after: { isActive: args.isActive },
    });
    await emitDomainEvent(ctx, {
      institutionId: household.institutionId,
      eventName: "household.updated",
      payload: { householdId: args.householdId },
    });
  },
});

// --- People --------------------------------------------------------------------

const personFields = {
  title: v.optional(v.string()),
  firstName: v.optional(v.string()),
  middleName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  nickname: v.optional(v.string()),
  suffix: v.optional(v.string()),
  mailName: v.optional(v.string()),
  personType: v.optional(v.string()),
  gender: v.optional(genderValidator),
  maritalStatus: v.optional(v.string()),
  hebrewGivenName: v.optional(v.string()),
  hebrewFatherName: v.optional(v.string()),
  hebrewMotherName: v.optional(v.string()),
  hebrewFamilyName: v.optional(v.string()),
  dateOfBirth: optionalIsoDate,
  hebrewBirthDate: v.optional(v.string()),
};

export const listPeople = query({
  args: {
    institutionId: v.id("institutions"),
    activeOnly: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx, args.institutionId);
    if (args.activeOnly === true) {
      return await ctx.db
        .query("people")
        .withIndex("by_institution_active", (q) =>
          q.eq("institutionId", args.institutionId).eq("isActive", true),
        )
        .order("desc")
        .paginate(args.paginationOpts);
    }
    return await ctx.db
      .query("people")
      .withIndex("by_institution", (q) => q.eq("institutionId", args.institutionId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const searchPeople = query({
  args: {
    institutionId: v.id("institutions"),
    query: v.string(),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx, args.institutionId);
    if (args.query.trim() === "") {
      return [];
    }
    return await ctx.db
      .query("people")
      .withSearchIndex("search_display_name", (q) =>
        q.search("displayName", args.query).eq("institutionId", args.institutionId),
      )
      .take(20);
  },
});

/** A person with their household memberships (joined to households). */
export const getPerson = query({
  args: { personId: v.id("people") },
  handler: async (ctx, args) => {
    const person = await ctx.db.get(args.personId);
    if (person === null) {
      return null;
    }
    await requireStaff(ctx, person.institutionId);

    const membershipRows = await ctx.db
      .query("householdMembers")
      .withIndex("by_person", (q) => q.eq("personId", args.personId))
      .collect();
    const memberships = [];
    for (const membership of membershipRows) {
      const household = await ctx.db.get(membership.householdId);
      if (household !== null) {
        memberships.push({
          membershipId: membership._id,
          householdId: household._id,
          householdName: household.displayName,
          role: membership.role,
          isActive: membership.isActive,
        });
      }
    }
    return { person, memberships };
  },
});

export const createPerson = mutation({
  args: {
    institutionId: v.id("institutions"),
    ...personFields,
    metadata: v.optional(metadataValidator),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireStaff(ctx, args.institutionId);
    const displayName = buildPersonDisplayName(args);
    const personId = await ctx.db.insert("people", {
      ...pruneUndefined(args),
      institutionId: args.institutionId,
      displayName,
      gender: args.gender ?? "unknown",
      honoraryMember: false,
      eligibleForAliyah: true,
      isDeceased: false,
      isActive: true,
      metadata: args.metadata ?? {},
      updatedAt: Date.now(),
    });
    await logAudit(ctx, {
      institutionId: args.institutionId,
      actorUserId: userId,
      entityType: "person",
      entityId: personId,
      action: "create",
      after: { displayName },
    });
    return personId;
  },
});

export const updatePerson = mutation({
  args: {
    personId: v.id("people"),
    ...personFields,
    honoraryMember: v.optional(v.boolean()),
    eligibleForAliyah: v.optional(v.boolean()),
    isDeceased: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const person = await ctx.db.get(args.personId);
    if (person === null) {
      throw new ConvexError("Person not found.");
    }
    const { userId } = await requireStaff(ctx, person.institutionId);
    const { personId, ...updates } = args;
    const merged = { ...person, ...pruneUndefined(updates) };
    await ctx.db.patch(personId, {
      ...pruneUndefined(updates),
      displayName: buildPersonDisplayName(merged),
      updatedAt: Date.now(),
    });
    await logAudit(ctx, {
      institutionId: person.institutionId,
      actorUserId: userId,
      entityType: "person",
      entityId: personId,
      action: "update",
      before: { displayName: person.displayName },
      after: pruneUndefined(updates),
    });
  },
});

export const setPersonActive = mutation({
  args: {
    personId: v.id("people"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const person = await ctx.db.get(args.personId);
    if (person === null) {
      throw new ConvexError("Person not found.");
    }
    const { userId } = await requireStaff(ctx, person.institutionId);
    await ctx.db.patch(args.personId, { isActive: args.isActive, updatedAt: Date.now() });
    await logAudit(ctx, {
      institutionId: person.institutionId,
      actorUserId: userId,
      entityType: "person",
      entityId: args.personId,
      action: "update",
      after: { isActive: args.isActive },
    });
  },
});

// --- Household membership --------------------------------------------------------

export const addHouseholdMember = mutation({
  args: {
    householdId: v.id("households"),
    personId: v.id("people"),
    role: v.optional(householdMemberRoleValidator),
    isPrimaryContact: v.optional(v.boolean()),
    isBillingContact: v.optional(v.boolean()),
    isMailRecipient: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const household = await ctx.db.get(args.householdId);
    if (household === null) {
      throw new ConvexError("Household not found.");
    }
    const person = await ctx.db.get(args.personId);
    if (person === null) {
      throw new ConvexError("Person not found.");
    }
    if (person.institutionId !== household.institutionId) {
      throw new ConvexError("Person and household belong to different institutions.");
    }
    const { userId } = await requireStaff(ctx, household.institutionId);

    const now = Date.now();
    const existing = await ctx.db
      .query("householdMembers")
      .withIndex("by_household_person", (q) =>
        q.eq("householdId", args.householdId).eq("personId", args.personId),
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
        householdId: args.householdId,
        personId: args.personId,
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
      actorUserId: userId,
      entityType: "householdMember",
      entityId: `${args.householdId}:${args.personId}`,
      action: existing === null ? "create" : "update",
      after: { role: args.role ?? "other" },
    });
    await emitDomainEvent(ctx, {
      institutionId: household.institutionId,
      eventName: "membership.changed",
      payload: { householdId: args.householdId, personId: args.personId },
    });
    return membershipId;
  },
});

export const setHouseholdMemberActive = mutation({
  args: {
    membershipId: v.id("householdMembers"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db.get(args.membershipId);
    if (membership === null) {
      throw new ConvexError("Membership not found.");
    }
    const { userId } = await requireStaff(ctx, membership.institutionId);
    await ctx.db.patch(args.membershipId, { isActive: args.isActive, updatedAt: Date.now() });
    await logAudit(ctx, {
      institutionId: membership.institutionId,
      actorUserId: userId,
      entityType: "householdMember",
      entityId: `${membership.householdId}:${membership.personId}`,
      action: "update",
      after: { isActive: args.isActive },
    });
    await emitDomainEvent(ctx, {
      institutionId: membership.institutionId,
      eventName: "membership.changed",
      payload: { householdId: membership.householdId, personId: membership.personId },
    });
  },
});

// --- Dashboard -----------------------------------------------------------------

/**
 * Counts for the overview page. Reads whole (indexed) ranges, which is fine
 * at synagogue scale; swap for materialized counters if an institution ever
 * exceeds tens of thousands of records.
 */
export const dashboardStats = query({
  args: { institutionId: v.id("institutions") },
  handler: async (ctx, args) => {
    await requireStaff(ctx, args.institutionId);
    const [activeHouseholds, activePeople] = await Promise.all([
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
    ]);
    return {
      activeHouseholds: activeHouseholds.length,
      activePeople: activePeople.length,
    };
  },
});

function pruneUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}
