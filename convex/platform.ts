import { getAuthUserId } from "@convex-dev/auth/server";
import { DEFAULT_ENABLED_MODULES, isValidSlug, MODULES } from "@shulstack/platform";
import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireStaff, requireUserId, roleAtLeast } from "./lib/access";
import { logAudit } from "./lib/audit";
import { moduleSlugValidator, staffRoleValidator } from "./lib/validators";

export const listMyInstitutions = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return [];
    }
    const memberships = await ctx.db
      .query("staffMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const results = [];
    for (const membership of memberships) {
      if (!membership.isActive) {
        continue;
      }
      const institution = await ctx.db.get(membership.institutionId);
      if (institution !== null) {
        results.push({
          institutionId: institution._id,
          slug: institution.slug,
          name: institution.name,
          timezone: institution.timezone,
          role: membership.role,
        });
      }
    }
    return results;
  },
});

/**
 * Everything the dashboard shell needs for one institution. Returns null
 * (rather than throwing) when the viewer has no access, so the UI can render
 * a friendly gate while auth state settles.
 */
export const getWorkspace = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }
    const institution = await ctx.db
      .query("institutions")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (institution === null) {
      return null;
    }
    const membership = await ctx.db
      .query("staffMembers")
      .withIndex("by_institution_user", (q) =>
        q.eq("institutionId", institution._id).eq("userId", userId),
      )
      .unique();
    if (membership === null || !membership.isActive) {
      return null;
    }

    const enablement = await ctx.db
      .query("moduleEnablement")
      .withIndex("by_institution", (q) => q.eq("institutionId", institution._id))
      .collect();
    const enabledBySlug = new Map(enablement.map((row) => [row.moduleSlug, row.enabled]));

    return {
      institution: {
        _id: institution._id,
        slug: institution.slug,
        name: institution.name,
        timezone: institution.timezone,
      },
      role: membership.role,
      modules: MODULES.map((module) => ({
        ...module,
        enabled: enabledBySlug.get(module.slug) ?? false,
      })),
    };
  },
});

export const createInstitution = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const slug = args.slug.trim();
    const name = args.name.trim();
    if (!isValidSlug(slug)) {
      throw new ConvexError("Slugs are lowercase letters, numbers, and hyphens (max 64 chars).");
    }
    if (name === "") {
      throw new ConvexError("Name is required.");
    }
    const existing = await ctx.db
      .query("institutions")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existing !== null) {
      throw new ConvexError(`An institution with the slug "${slug}" already exists.`);
    }

    const now = Date.now();
    const institutionId = await ctx.db.insert("institutions", {
      slug,
      name,
      timezone: args.timezone ?? "America/New_York",
      branding: {},
      settings: {},
      updatedAt: now,
    });
    await ctx.db.insert("staffMembers", {
      institutionId,
      userId,
      role: "owner",
      isActive: true,
      updatedAt: now,
    });
    for (const module of MODULES) {
      await ctx.db.insert("moduleEnablement", {
        institutionId,
        moduleSlug: module.slug,
        enabled: DEFAULT_ENABLED_MODULES.includes(module.slug),
        updatedAt: now,
      });
    }
    await logAudit(ctx, {
      institutionId,
      actorUserId: userId,
      entityType: "institution",
      entityId: institutionId,
      action: "create",
      after: { slug, name },
    });
    return { institutionId, slug };
  },
});

export const updateInstitution = mutation({
  args: {
    institutionId: v.id("institutions"),
    name: v.optional(v.string()),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, institution } = await requireStaff(ctx, args.institutionId, "admin");
    const name = args.name?.trim();
    if (name === "") {
      throw new ConvexError("Name cannot be empty.");
    }
    await ctx.db.patch(args.institutionId, {
      ...(name === undefined ? {} : { name }),
      ...(args.timezone === undefined ? {} : { timezone: args.timezone }),
      updatedAt: Date.now(),
    });
    await logAudit(ctx, {
      institutionId: args.institutionId,
      actorUserId: userId,
      entityType: "institution",
      entityId: args.institutionId,
      action: "update",
      before: { name: institution.name, timezone: institution.timezone },
      after: { name: name ?? institution.name, timezone: args.timezone ?? institution.timezone },
    });
  },
});

export const setModuleEnabled = mutation({
  args: {
    institutionId: v.id("institutions"),
    moduleSlug: moduleSlugValidator,
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireStaff(ctx, args.institutionId, "admin");
    const now = Date.now();
    const existing = await ctx.db
      .query("moduleEnablement")
      .withIndex("by_institution_module", (q) =>
        q.eq("institutionId", args.institutionId).eq("moduleSlug", args.moduleSlug),
      )
      .unique();
    if (existing === null) {
      await ctx.db.insert("moduleEnablement", {
        institutionId: args.institutionId,
        moduleSlug: args.moduleSlug,
        enabled: args.enabled,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(existing._id, { enabled: args.enabled, updatedAt: now });
    }
    await logAudit(ctx, {
      institutionId: args.institutionId,
      actorUserId: userId,
      entityType: "module",
      entityId: args.moduleSlug,
      action: "update",
      after: { enabled: args.enabled },
    });
  },
});

export const listStaff = query({
  args: { institutionId: v.id("institutions") },
  handler: async (ctx, args) => {
    const { userId } = await requireStaff(ctx, args.institutionId);
    const members = await ctx.db
      .query("staffMembers")
      .withIndex("by_institution", (q) => q.eq("institutionId", args.institutionId))
      .collect();

    const results = [];
    for (const member of members) {
      const user = await ctx.db.get(member.userId);
      results.push({
        staffMemberId: member._id,
        role: member.role,
        isActive: member.isActive,
        name: user?.name,
        email: user?.email,
        isViewer: member.userId === userId,
      });
    }
    return results;
  },
});

export const addStaffByEmail = mutation({
  args: {
    institutionId: v.id("institutions"),
    email: v.string(),
    role: staffRoleValidator,
  },
  handler: async (ctx, args) => {
    const { userId, staff } = await requireStaff(ctx, args.institutionId, "admin");
    if (args.role === "owner") {
      throw new ConvexError("Ownership cannot be granted here.");
    }
    if (args.role === "admin" && !roleAtLeast(staff.role, "owner")) {
      throw new ConvexError("Only the owner can add admins.");
    }
    const email = args.email.trim().toLowerCase();
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    if (user === null) {
      throw new ConvexError(
        "No account with that email. Ask them to sign up first, then add them.",
      );
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("staffMembers")
      .withIndex("by_institution_user", (q) =>
        q.eq("institutionId", args.institutionId).eq("userId", user._id),
      )
      .unique();
    if (existing !== null) {
      if (existing.role === "owner") {
        throw new ConvexError("That person is the owner.");
      }
      await ctx.db.patch(existing._id, { role: args.role, isActive: true, updatedAt: now });
    } else {
      await ctx.db.insert("staffMembers", {
        institutionId: args.institutionId,
        userId: user._id,
        role: args.role,
        isActive: true,
        updatedAt: now,
      });
    }
    await logAudit(ctx, {
      institutionId: args.institutionId,
      actorUserId: userId,
      entityType: "staffMember",
      entityId: user._id,
      action: existing === null ? "create" : "update",
      after: { email, role: args.role },
    });
  },
});

export const setStaffActive = mutation({
  args: {
    staffMemberId: v.id("staffMembers"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const target = await ctx.db.get(args.staffMemberId);
    if (target === null) {
      throw new ConvexError("Staff member not found.");
    }
    const { userId } = await requireStaff(ctx, target.institutionId, "admin");
    if (target.role === "owner") {
      throw new ConvexError("The owner cannot be deactivated.");
    }
    if (target.userId === userId) {
      throw new ConvexError("You cannot deactivate yourself.");
    }
    await ctx.db.patch(target._id, { isActive: args.isActive, updatedAt: Date.now() });
    await logAudit(ctx, {
      institutionId: target.institutionId,
      actorUserId: userId,
      entityType: "staffMember",
      entityId: target.userId,
      action: "update",
      after: { isActive: args.isActive },
    });
  },
});

export const listRecentAuditLogs = query({
  args: {
    institutionId: v.id("institutions"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx, args.institutionId);
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);
    const entries = await ctx.db
      .query("auditLogs")
      .withIndex("by_institution", (q) => q.eq("institutionId", args.institutionId))
      .order("desc")
      .take(limit);

    const results = [];
    for (const entry of entries) {
      const actor = entry.actorUserId === undefined ? null : await ctx.db.get(entry.actorUserId);
      results.push({
        _id: entry._id,
        _creationTime: entry._creationTime,
        entityType: entry.entityType,
        entityId: entry.entityId,
        action: entry.action,
        actorEmail: actor?.email,
      });
    }
    return results;
  },
});
