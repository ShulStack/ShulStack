import { isValidSlug } from "@shulstack/platform";
import { ConvexError, v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireStaff } from "./lib/access";
import { logAudit } from "./lib/audit";
import { metadataValidator, pageStatusValidator } from "./lib/validators";

/** The institution behind a public-site request, or null when the website
 * (cms) module is disabled — disabling the module unpublishes the site. */
async function publicSiteInstitution(
  ctx: QueryCtx,
  institutionSlug: string,
): Promise<Doc<"institutions"> | null> {
  const institution = await ctx.db
    .query("institutions")
    .withIndex("by_slug", (q) => q.eq("slug", institutionSlug))
    .unique();
  if (institution === null) {
    return null;
  }
  const enablement = await ctx.db
    .query("moduleEnablement")
    .withIndex("by_institution_module", (q) =>
      q.eq("institutionId", institution._id).eq("moduleSlug", "cms"),
    )
    .unique();
  return enablement?.enabled === true ? institution : null;
}

/** Public read for the published site. No auth: published pages are public. */
export const getPublishedPage = query({
  args: {
    institutionSlug: v.string(),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const institution = await publicSiteInstitution(ctx, args.institutionSlug);
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

/** Published pages for an institution's public site index. */
export const listPublishedPages = query({
  args: { institutionSlug: v.string() },
  handler: async (ctx, args) => {
    const institution = await publicSiteInstitution(ctx, args.institutionSlug);
    if (institution === null) {
      return null;
    }
    const pages = await ctx.db
      .query("pages")
      .withIndex("by_institution_status", (q) =>
        q.eq("institutionId", institution._id).eq("status", "published"),
      )
      .collect();
    return {
      institutionName: institution.name,
      pages: pages.map((page) => ({
        slug: page.slug,
        title: page.title,
        summary: page.summary,
      })),
    };
  },
});

/** Staff read of a page in any status, for the editor. */
export const getPageForStaff = query({
  args: {
    institutionId: v.id("institutions"),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx, args.institutionId);
    return await ctx.db
      .query("pages")
      .withIndex("by_institution_slug", (q) =>
        q.eq("institutionId", args.institutionId).eq("slug", args.slug),
      )
      .unique();
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
    const slug = args.slug.trim();
    if (!isValidSlug(slug)) {
      throw new ConvexError(
        "Page slugs are lowercase letters, numbers, and hyphens (max 64 chars).",
      );
    }
    const now = Date.now();
    const existing = await ctx.db
      .query("pages")
      .withIndex("by_institution_slug", (q) =>
        q.eq("institutionId", args.institutionId).eq("slug", slug),
      )
      .unique();

    const status = args.status ?? existing?.status ?? "draft";
    const becamePublished = status === "published" && existing?.status !== "published";

    // An empty string clears an optional text field; omitting it keeps the
    // existing value (patch removes fields set to undefined).
    const clearable = (incoming: string | undefined, current: string | undefined) =>
      incoming === undefined ? current : incoming.trim() === "" ? undefined : incoming;

    let pageId = existing?._id;
    if (existing === null) {
      pageId = await ctx.db.insert("pages", {
        institutionId: args.institutionId,
        slug,
        title: args.title,
        summary: clearable(args.summary, undefined),
        layout: args.layout ?? [],
        seoTitle: clearable(args.seoTitle, undefined),
        seoDescription: clearable(args.seoDescription, undefined),
        status,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(existing._id, {
        title: args.title,
        summary: clearable(args.summary, existing.summary),
        layout: args.layout ?? existing.layout,
        seoTitle: clearable(args.seoTitle, existing.seoTitle),
        seoDescription: clearable(args.seoDescription, existing.seoDescription),
        status,
        updatedAt: now,
      });
    }
    await logAudit(ctx, {
      institutionId: args.institutionId,
      actorUserId: userId,
      entityType: "page",
      entityId: slug,
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
