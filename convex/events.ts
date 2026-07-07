import { internalMutation } from "./_generated/server";
import { processEvent } from "./lib/domainEvents";

const BATCH_SIZE = 25;

/**
 * Drains pending domain events. Runs near-immediately after every emit (via
 * the scheduler) and every few minutes from cron as a retry sweeper.
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
    return pending.length;
  },
});
