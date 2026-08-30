import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { MAX_EVENT_ATTEMPTS } from "../../convex/lib/domainEvents";
import {
  type Backend,
  createBackend,
  createInstitutionAs,
  settleScheduled,
  signUp,
} from "./helpers";

describe("domain event processing", () => {
  let t: Backend;
  let owner: Awaited<ReturnType<typeof signUp>>;
  let institutionId: Id<"institutions">;

  beforeEach(async () => {
    vi.useFakeTimers();
    t = createBackend();
    owner = await signUp(t, "owner@example.com");
    institutionId = await createInstitutionAs(owner.as);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("events without a handler are marked processed", async () => {
    await t.run(async (ctx) => {
      await ctx.db.insert("domainEvents", {
        institutionId,
        eventName: "some.unknown.event",
        payload: {},
        status: "pending",
        attempts: 0,
      });
    });
    await t.mutation(internal.events.processPendingEvents, {});

    const events = await t.run(async (ctx) => await ctx.db.query("domainEvents").collect());
    expect(events[0]).toMatchObject({ status: "processed", attempts: 1 });
    expect(events[0]?.processedAt).toBeDefined();
  });

  test("failing events retry, then land in failed with the error recorded", async () => {
    // household.created with a garbage payload makes the handler throw.
    await t.run(async (ctx) => {
      await ctx.db.insert("domainEvents", {
        institutionId,
        eventName: "household.created",
        payload: { householdId: "not-a-real-id" },
        status: "pending",
        attempts: 0,
      });
    });

    for (let attempt = 1; attempt < MAX_EVENT_ATTEMPTS; attempt += 1) {
      await t.mutation(internal.events.processPendingEvents, {});
      const [event] = await t.run(async (ctx) => await ctx.db.query("domainEvents").collect());
      expect(event).toMatchObject({ status: "pending", attempts: attempt });
      expect(event?.error).toMatch(/householdId/);
    }

    await t.mutation(internal.events.processPendingEvents, {});
    const [event] = await t.run(async (ctx) => await ctx.db.query("domainEvents").collect());
    expect(event).toMatchObject({ status: "failed", attempts: MAX_EVENT_ATTEMPTS });

    // Failed events are terminal: another sweep does not touch them.
    await t.mutation(internal.events.processPendingEvents, {});
    const [after] = await t.run(async (ctx) => await ctx.db.query("domainEvents").collect());
    expect(after?.attempts).toBe(MAX_EVENT_ATTEMPTS);
  });

  test("the billing-profile handler is idempotent", async () => {
    const householdId = await t.run(async (ctx) => {
      return await ctx.db.insert("households", {
        institutionId,
        displayName: "Cohen Family",
        isActive: true,
        metadata: {},
        updatedAt: Date.now(),
      });
    });
    await t.run(async (ctx) => {
      for (let i = 0; i < 2; i += 1) {
        await ctx.db.insert("domainEvents", {
          institutionId,
          eventName: "household.created",
          payload: { householdId },
          status: "pending",
          attempts: 0,
        });
      }
    });
    await t.mutation(internal.events.processPendingEvents, {});

    const profiles = await t.run(
      async (ctx) => await ctx.db.query("householdBillingProfiles").collect(),
    );
    expect(profiles).toHaveLength(1);
  });

  test("a full batch schedules a follow-up drain", async () => {
    await t.run(async (ctx) => {
      for (let i = 0; i < 26; i += 1) {
        await ctx.db.insert("domainEvents", {
          institutionId,
          eventName: "some.unknown.event",
          payload: { index: i },
          status: "pending",
          attempts: 0,
        });
      }
    });
    const drained = await t.mutation(internal.events.processPendingEvents, {});
    expect(drained).toBe(25);
    await settleScheduled(t);

    const events = await t.run(async (ctx) => await ctx.db.query("domainEvents").collect());
    expect(events.every((event) => event.status === "processed")).toBe(true);
  });

  test("failed events can be listed and requeued by admins", async () => {
    await t.run(async (ctx) => {
      await ctx.db.insert("domainEvents", {
        institutionId,
        eventName: "household.created",
        payload: { householdId: "not-a-real-id" },
        status: "pending",
        attempts: 0,
      });
    });
    for (let attempt = 0; attempt < MAX_EVENT_ATTEMPTS; attempt += 1) {
      await t.mutation(internal.events.processPendingEvents, {});
    }

    const failed = await owner.as.query(api.events.listFailedEvents, { institutionId });
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ eventName: "household.created", status: "failed" });

    const outsider = await signUp(t, "outsider@example.com");
    await expect(outsider.as.query(api.events.listFailedEvents, { institutionId })).rejects.toThrow(
      /access/,
    );

    if (failed[0] === undefined) throw new Error("unreachable");
    await owner.as.mutation(api.events.retryFailedEvent, { eventId: failed[0]._id });
    const [requeued] = await t.run(async (ctx) => await ctx.db.query("domainEvents").collect());
    expect(requeued).toMatchObject({ status: "pending", attempts: 0 });
  });

  test("events referencing deleted households are processed as no-ops", async () => {
    const householdId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("households", {
        institutionId,
        displayName: "Ghost Family",
        isActive: true,
        metadata: {},
        updatedAt: Date.now(),
      });
      await ctx.db.delete(id);
      return id;
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("domainEvents", {
        institutionId,
        eventName: "household.created",
        payload: { householdId },
        status: "pending",
        attempts: 0,
      });
    });
    await t.mutation(internal.events.processPendingEvents, {});
    const [event] = await t.run(async (ctx) => await ctx.db.query("domainEvents").collect());
    expect(event?.status).toBe("processed");
  });
});
