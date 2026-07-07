import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireStaff } from "./lib/access";
import { logAudit } from "./lib/audit";
import { metadataValidator, pageStatusValidator } from "./lib/validators";

/** Public read for the published site. No auth: published pages are public. */
export const getPublishedPage = query({
  args: {
    institutionSlug: v.string(),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const institution = await ctx.db
      .query("institutions")
      .withIndex("by_slug", (q) => q.eq("slug", args.institutionSlug))
      .unique();
    if (institution === null) {
      return null;
    }
    const page = await ctx.db
      .query("pages")
      .withIndex("by_institution_slug", (q) =>
        q.eq("institutionId", institution._id).eq("slug", args.slug),
      )
      .unique();
    if (page === null || page.status !== "published") {
      return null;
    }
    return page;
  },
});

export const listPages = query({
  args: { institutionId: v.id("institutions") },
  handler: async (ctx, args) => {
    await requireStaff(ctx, args.institutionId);
    return await ctx.db
      .query("pages")
      .withIndex("by_institution_slug", (q) => q.eq("institutionId", args.institutionId))
      .collect();
  },
});

export const upsertPage = mutation({
  args: {
    institutionId: v.id("institutions"),
    slug: v.string(),
    title: v.string(),
    summary: v.optional(v.string()),
    layout: v.optional(v.array(metadataValidator)),
    seoTitle: v.optional(v.string()),
    seoDescription: v.optional(v.string()),
    status: v.optional(pageStatusValidator),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireStaff(ctx, args.institutionId, "admin");
    if (args.title.trim() === "") {
      throw new ConvexError("Page title is required.");
    }
    const now = Date.now();
    const existing = await ctx.db
      .query("pages")
      .withIndex("by_institution_slug", (q) =>
        q.eq("institutionId", args.institutionId).eq("slug", args.slug),
      )
      .unique();

    const status = args.status ?? existing?.status ?? "draft";
    const becamePublished = status === "published" && existing?.status !== "published";

    let pageId = existing?._id;
    if (existing === null) {
      pageId = await ctx.db.insert("pages", {
        institutionId: args.institutionId,
        slug: args.slug,
        title: args.title,
        summary: args.summary,
        layout: args.layout ?? [],
        seoTitle: args.seoTitle,
        seoDescription: args.seoDescription,
        status,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(existing._id, {
        title: args.title,
        summary: args.summary ?? existing.summary,
        layout: args.layout ?? existing.layout,
        seoTitle: args.seoTitle ?? existing.seoTitle,
        seoDescription: args.seoDescription ?? existing.seoDescription,
        status,
        updatedAt: now,
      });
    }
    await logAudit(ctx, {
      institutionId: args.institutionId,
      actorUserId: userId,
      entityType: "page",
      entityId: args.slug,
      action: becamePublished ? "publish" : existing === null ? "create" : "update",
      after: { title: args.title, status },
    });
    return pageId;
  },
});

export const getSiteSettings = query({
  args: {
    institutionId: v.id("institutions"),
    key: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx, args.institutionId);
    const key = args.key ?? "default";
    return await ctx.db
      .query("siteSettings")
      .withIndex("by_institution_key", (q) =>
        q.eq("institutionId", args.institutionId).eq("key", key),
      )
      .unique();
  },
});

export const setSiteSettings = mutation({
  args: {
    institutionId: v.id("institutions"),
    key: v.optional(v.string()),
    value: metadataValidator,
  },
  handler: async (ctx, args) => {
    const { userId } = await requireStaff(ctx, args.institutionId, "admin");
    const key = args.key ?? "default";
    const now = Date.now();
    const existing = await ctx.db
      .query("siteSettings")
      .withIndex("by_institution_key", (q) =>
        q.eq("institutionId", args.institutionId).eq("key", key),
      )
      .unique();
    if (existing === null) {
      await ctx.db.insert("siteSettings", {
        institutionId: args.institutionId,
        key,
        value: args.value,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(existing._id, { value: args.value, updatedAt: now });
    }
    await logAudit(ctx, {
      institutionId: args.institutionId,
      actorUserId: userId,
      entityType: "siteSettings",
      entityId: key,
      action: "update",
      after: args.value,
    });
  },
});
