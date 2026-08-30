import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireStaff } from "./lib/access";
import { logAudit } from "./lib/audit";
import { processEvent } from "./lib/domainEvents";

const BATCH_SIZE = 25;

/**
 * Drains pending domain events. Scheduled after an emit into an empty queue
 * (see emitDomainEvent) and every few minutes from cron as a retry sweeper;
 * reschedules itself while full batches keep coming.
 */
export const processPendingEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("domainEvents")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(BATCH_SIZE);
    for (const event of pending) {
      await processEvent(ctx, event);
    }
    if (pending.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.events.processPendingEvents, {});
    }
    return pending.length;
  },
});

/** Events that exhausted their retries, so admins can see and requeue them. */
export const listFailedEvents = query({
  args: {
    institutionId: v.id("institutions"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx, args.institutionId, "admin");
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);
    return await ctx.db
      .query("domainEvents")
      .withIndex("by_institution_status", (q) =>
        q.eq("institutionId", args.institutionId).eq("status", "failed"),
      )
      .order("desc")
      .take(limit);
  },
});

/** Requeue one failed event with a fresh attempt budget. */
export const retryFailedEvent = mutation({
  args: { eventId: v.id("domainEvents") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (event === null) {
      throw new ConvexError("Event not found.");
    }
    const { userId } = await requireStaff(ctx, event.institutionId, "admin");
    if (event.status !== "failed") {
      throw new ConvexError("Only failed events can be retried.");
    }
    await ctx.db.patch(event._id, { status: "pending", attempts: 0, error: undefined });
    await ctx.scheduler.runAfter(0, internal.events.processPendingEvents, {});
    await logAudit(ctx, {
      institutionId: event.institutionId,
      actorUserId: userId,
      entityType: "domainEvent",
      entityId: args.eventId,
      action: "update",
      after: { retried: event.eventName },
    });
  },
});
