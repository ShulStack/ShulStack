import { ConvexError, v } from "convex/values";

import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireStaff } from "./lib/access";
import { apiKeyDisplayPrefix, generateApiKeySecret, hashApiKeySecret } from "./lib/apiKeys";
import { logAudit } from "./lib/audit";
import { type ApiKeyScope, apiKeyScopeValidator } from "./lib/validators";

const MAX_ACTIVE_KEYS = 20;

/**
 * Create an institution-scoped API key. The full secret is returned exactly
 * once, from this mutation; only its hash is stored. Scopes default to
 * read-only; a key granted "write" always carries "read" as well.
 */
export const createApiKey = mutation({
  args: {
    institutionId: v.id("institutions"),
    name: v.string(),
    scopes: v.optional(v.array(apiKeyScopeValidator)),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireStaff(ctx, args.institutionId, "admin");
    const name = args.name.trim();
    if (name === "") {
      throw new ConvexError('Give the key a name (e.g. "Campaign dashboard").');
    }
    const scopes: ApiKeyScope[] =
      args.scopes?.includes("write") === true ? ["read", "write"] : ["read"];

    const existing = await ctx.db
      .query("apiKeys")
      .withIndex("by_institution", (q) => q.eq("institutionId", args.institutionId))
      .collect();
    const activeCount = existing.filter((key) => key.revokedAt === undefined).length;
    if (activeCount >= MAX_ACTIVE_KEYS) {
      throw new ConvexError(`At most ${MAX_ACTIVE_KEYS} active keys; revoke one first.`);
    }

    const secret = generateApiKeySecret();
    const keyPrefix = apiKeyDisplayPrefix(secret);
    const apiKeyId = await ctx.db.insert("apiKeys", {
      institutionId: args.institutionId,
      name,
      keyPrefix,
      keyHash: hashApiKeySecret(secret),
      scopes,
      createdBy: userId,
      updatedAt: Date.now(),
    });
    await logAudit(ctx, {
      institutionId: args.institutionId,
      actorUserId: userId,
      entityType: "apiKey",
      entityId: apiKeyId,
      action: "create",
      after: { name, keyPrefix, scopes },
    });
    return { apiKeyId, secret, keyPrefix };
  },
});

/** Keys for the developer settings page. Never returns hashes or secrets. */
export const listApiKeys = query({
  args: { institutionId: v.id("institutions") },
  handler: async (ctx, args) => {
    await requireStaff(ctx, args.institutionId, "admin");
    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_institution", (q) => q.eq("institutionId", args.institutionId))
      .order("desc")
      .collect();

    const results = [];
    for (const key of keys) {
      const creator = await ctx.db.get(key.createdBy);
      results.push({
        apiKeyId: key._id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        scopes: key.scopes,
        createdAt: key._creationTime,
        createdByEmail: creator?.email,
        lastUsedAt: key.lastUsedAt,
        revokedAt: key.revokedAt,
      });
    }
    return results;
  },
});

/** Revocation is immediate and permanent; rotate by creating a new key. */
export const revokeApiKey = mutation({
  args: { apiKeyId: v.id("apiKeys") },
  handler: async (ctx, args) => {
    const key = await ctx.db.get(args.apiKeyId);
    if (key === null) {
      throw new ConvexError("API key not found.");
    }
    const { userId } = await requireStaff(ctx, key.institutionId, "admin");
    if (key.revokedAt !== undefined) {
      throw new ConvexError("This key is already revoked.");
    }
    await ctx.db.patch(key._id, { revokedAt: Date.now(), updatedAt: Date.now() });
    await logAudit(ctx, {
      institutionId: key.institutionId,
      actorUserId: userId,
      entityType: "apiKey",
      entityId: key._id,
      action: "update",
      after: { name: key.name, keyPrefix: key.keyPrefix, revoked: true },
    });
  },
});

/** HTTP-layer lookup: hash → live key, or null for unknown/revoked/expired. */
export const resolveApiKey = internalQuery({
  args: { keyHash: v.string() },
  handler: async (ctx, args) => {
    const key = await ctx.db
      .query("apiKeys")
      .withIndex("by_hash", (q) => q.eq("keyHash", args.keyHash))
      .unique();
    if (key === null || key.revokedAt !== undefined) {
      return null;
    }
    if (key.expiresAt !== undefined && key.expiresAt < Date.now()) {
      return null;
    }
    return {
      apiKeyId: key._id,
      institutionId: key.institutionId,
      scopes: key.scopes,
      lastUsedAt: key.lastUsedAt,
      name: key.name,
      keyPrefix: key.keyPrefix,
    };
  },
});

export const touchApiKey = internalMutation({
  args: { apiKeyId: v.id("apiKeys") },
  handler: async (ctx, args) => {
    const key = await ctx.db.get(args.apiKeyId);
    if (key !== null && key.revokedAt === undefined) {
      await ctx.db.patch(key._id, { lastUsedAt: Date.now() });
    }
  },
});
