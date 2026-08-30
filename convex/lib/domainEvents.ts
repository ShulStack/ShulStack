import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export const MAX_EVENT_ATTEMPTS = 3;

/**
 * Handlers run inside the processing mutation. They MUST be idempotent: a
 * handler that throws after partial writes will be retried, and Convex has no
 * sub-transactions, so partial writes from a failed attempt persist.
 */
type DomainEventHandler = (ctx: MutationCtx, event: Doc<"domainEvents">) => Promise<void>;

export const domainEventHandlers: Record<string, DomainEventHandler> = {
  // Every household gets a billing profile so finance flows never have to
  // handle the "no profile yet" case.
  "household.created": async (ctx, event) => {
    const raw = event.payload.householdId;
    const householdId = typeof raw === "string" ? ctx.db.normalizeId("households", raw) : null;
    if (householdId === null) {
      throw new Error(`household.created event ${event._id} has no valid householdId`);
    }
    const household = await ctx.db.get(householdId);
    if (household === null) {
      return; // Household deleted before the event ran; nothing to do.
    }
    const existing = await ctx.db
      .query("householdBillingProfiles")
      .withIndex("by_household", (q) => q.eq("householdId", householdId))
      .unique();
    if (existing === null) {
      await ctx.db.insert("householdBillingProfiles", {
        institutionId: household.institutionId,
        householdId,
        balanceMinor: 0,
        currency: "USD",
        metadata: {},
        updatedAt: Date.now(),
      });
    }
  },
};

type DomainEventInput = {
  institutionId: Id<"institutions">;
  eventName: string;
  payload: Record<string, unknown>;
};

/**
 * Record a domain event and schedule near-immediate processing. Events are
 * facts about what happened; they are only ever written by mutations, never
 * by clients directly.
 *
 * Scheduling is deduplicated: a drain is only scheduled when the pending
 * queue was empty, and the processor reschedules itself while it keeps
 * finding full batches. Events whose attempt failed are re-driven by the
 * cron sweeper instead.
 */
export async function emitDomainEvent(ctx: MutationCtx, event: DomainEventInput): Promise<void> {
  const alreadyPending = await ctx.db
    .query("domainEvents")
    .withIndex("by_status", (q) => q.eq("status", "pending"))
    .first();
  await ctx.db.insert("domainEvents", {
    ...event,
    status: "pending",
    attempts: 0,
  });
  if (alreadyPending === null) {
    await ctx.scheduler.runAfter(0, internal.events.processPendingEvents, {});
  }
}

/** Process one event, recording success or a retryable/terminal failure. */
export async function processEvent(ctx: MutationCtx, event: Doc<"domainEvents">): Promise<void> {
  const attempts = event.attempts + 1;
  try {
    const handler = domainEventHandlers[event.eventName];
    if (handler !== undefined) {
      await handler(ctx, event);
    }
    await ctx.db.patch(event._id, {
      status: "processed",
      attempts,
      processedAt: Date.now(),
      error: undefined,
    });
  } catch (caught) {
    await ctx.db.patch(event._id, {
      status: attempts >= MAX_EVENT_ATTEMPTS ? "failed" : "pending",
      attempts,
      error: caught instanceof Error ? caught.message : String(caught),
    });
  }
}
