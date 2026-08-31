import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { type Backend, createBackend, createInstitutionAs, signUp } from "./helpers";

describe("analytics API", () => {
  let t: Backend;
  let owner: Awaited<ReturnType<typeof signUp>>;
  let institutionId: Id<"institutions">;
  let secret: string;

  beforeEach(async () => {
    vi.useFakeTimers();
    t = createBackend();
    owner = await signUp(t, "owner@example.com");
    institutionId = await createInstitutionAs(owner.as);
    const created = await owner.as.mutation(api.developer.createApiKey, {
      institutionId,
      name: "Analytics key",
    });
    secret = created.secret;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function get(path: string, key = secret) {
    return t.fetch(path, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
    });
  }

  async function household(displayName: string): Promise<Id<"households">> {
    return await owner.as.mutation(api.crm.createHousehold, { institutionId, displayName });
  }

  async function pay(
    householdId: Id<"households">,
    amountMinor: number,
    occurredAt: string,
    category?: string,
  ) {
    await owner.as.mutation(api.ledger.addLedgerEntry, {
      householdId,
      entryType: "payment",
      amountMinor,
      occurredAt,
      category,
    });
  }

  test("giving analytics answers threshold and ranking questions", async () => {
    const cohen = await household("Cohen Family");
    const levi = await household("Levi Family");
    const gold = await household("Goldberg Family");
    await pay(cohen, 600_000, "2026-01-15");
    await pay(cohen, 600_000, "2026-06-15"); // Cohen total: $12,000
    await pay(levi, 50_000, "2026-03-01"); // Levi: $500
    await pay(gold, 1_500_000, "2026-04-01", "Building Campaign"); // Goldberg: $15,000

    // Who paid at least $10,000?
    const over10k = await (
      await get("/api/v1/analytics/households?metric=payments&min=1000000")
    ).json();
    expect(over10k.data.map((row: { displayName: string }) => row.displayName)).toEqual([
      "Goldberg Family",
      "Cohen Family",
    ]);
    expect(over10k.summary).toMatchObject({
      matchedHouseholds: 2,
      totalMetricMinor: 2_700_000,
    });
    expect(over10k.data[0]).toMatchObject({ metricMinor: 1_500_000, paidMinor: 1_500_000 });

    // Date ranges narrow the fold.
    const early = await (
      await get("/api/v1/analytics/households?metric=payments&from=2026-01-01&to=2026-03-31")
    ).json();
    expect(early.data.map((row: { displayName: string }) => row.displayName)).toEqual([
      "Cohen Family",
      "Levi Family",
    ]);
    expect(early.summary.totalMetricMinor).toBe(650_000);

    // Category filter counts only matching entries.
    const campaign = await (
      await get("/api/v1/analytics/households?metric=payments&category=building%20campaign")
    ).json();
    expect(campaign.data).toHaveLength(1);
    expect(campaign.data[0]).toMatchObject({
      displayName: "Goldberg Family",
      metricMinor: 1_500_000,
    });

    // Ascending order and limit.
    const bottom = await (
      await get("/api/v1/analytics/households?metric=payments&order=asc&limit=1")
    ).json();
    expect(bottom.data).toHaveLength(1);
    expect(bottom.data[0]?.displayName).toBe("Levi Family");
    expect(bottom.summary.matchedHouseholds).toBe(3);
  });

  test("category totals roll up by ledger category", async () => {
    const cohen = await household("Cohen Family");
    await pay(cohen, 100_000, "2026-01-15", "Membership");
    await pay(cohen, 25_000, "2026-02-15", "Membership");
    await pay(cohen, 5_000, "2026-03-15");

    const totals = await (await get("/api/v1/analytics/categories")).json();
    expect(totals.data).toEqual([
      expect.objectContaining({ category: "Membership", paidMinor: 125_000, entryCount: 2 }),
      expect.objectContaining({ category: "(uncategorized)", paidMinor: 5_000 }),
    ]);
  });

  test("campaigns and pledges are exposed with rollups, scoped to the key", async () => {
    const campaignId = await owner.as.mutation(api.fundraising.createCampaign, {
      institutionId,
      name: "Building Campaign",
      goalMinor: 10_000_000,
    });
    const cohen = await household("Cohen Family");
    const pledgeId = await owner.as.mutation(api.fundraising.createPledge, {
      campaignId,
      householdId: cohen,
      amountMinor: 500_000,
      stage: "asked",
    });
    await owner.as.mutation(api.fundraising.recordPledgePayment, {
      pledgeId,
      amountMinor: 200_000,
      occurredAt: "2026-05-01",
      method: "check",
    });

    const campaigns = await (await get("/api/v1/campaigns")).json();
    expect(campaigns.data).toHaveLength(1);
    expect(campaigns.data[0]).toMatchObject({
      name: "Building Campaign",
      goalMinor: 10_000_000,
      rollup: { raisedMinor: 200_000, committedMinor: 500_000, openCount: 1 },
    });

    const open = await (await get("/api/v1/pledges?open=true")).json();
    expect(open.data).toHaveLength(1);
    expect(open.data[0]).toMatchObject({
      campaignName: "Building Campaign",
      householdName: "Cohen Family",
      stage: "pledged",
      paidMinor: 200_000,
    });

    // Another institution's key sees nothing, and its campaign ids 404 here.
    const outsider = await signUp(t, "outsider@example.com");
    const otherInstitution = await createInstitutionAs(outsider.as, "other-shul", "Other Shul");
    const otherKey = await outsider.as.mutation(api.developer.createApiKey, {
      institutionId: otherInstitution,
      name: "Other key",
    });
    const theirs = await (await get("/api/v1/pledges", otherKey.secret)).json();
    expect(theirs.data).toHaveLength(0);
    const crossTenant = await get(`/api/v1/pledges?campaignId=${campaignId}`, otherKey.secret);
    expect(crossTenant.status).toBe(404);
  });

  test("pledge write endpoints require write scope and keep the books tied", async () => {
    const campaignId = await owner.as.mutation(api.fundraising.createCampaign, {
      institutionId,
      name: "Building Campaign",
    });
    const cohen = await household("Cohen Family");
    const pledgeId = await owner.as.mutation(api.fundraising.createPledge, {
      campaignId,
      householdId: cohen,
      amountMinor: 500_000,
      stage: "asked",
    });
    const writeKey = await owner.as.mutation(api.developer.createApiKey, {
      institutionId,
      name: "Writer",
      scopes: ["read", "write"],
    });

    // The default read key is refused.
    const denied = await t.fetch(`/api/v1/pledges/${pledgeId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ stage: "pledged" }),
    });
    expect(denied.status).toBe(403);

    const patched = await t.fetch(`/api/v1/pledges/${pledgeId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${writeKey.secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ stage: "pledged", notes: "Confirmed by phone" }),
    });
    expect(patched.status).toBe(200);
    expect((await patched.json()).data).toMatchObject({
      stage: "pledged",
      notes: "Confirmed by phone",
    });

    const gift = await t.fetch(`/api/v1/pledges/${pledgeId}/gifts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${writeKey.secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ amountMinor: 500_000, occurredAt: "2026-09-15", method: "check" }),
    });
    expect(gift.status).toBe(201);
    expect((await gift.json()).data).toEqual({ paidMinor: 500_000, stage: "fulfilled" });

    // The gift landed as a matched pair: balance unmoved, books reconcile.
    const finance = await owner.as.query(api.finance.getHouseholdFinance, {
      householdId: cohen,
    });
    expect(finance?.profile?.balanceMinor).toBe(0);
    const report = await owner.as.query(api.finance.reconcileBalances, { institutionId });
    expect(report.mismatches).toEqual([]);

    // Another institution's pledge id answers 404 exactly like a missing one.
    const outsider = await signUp(t, "outsider2@example.com");
    const otherInstitution = await createInstitutionAs(outsider.as, "other-shul-2", "Other 2");
    const otherKey = await outsider.as.mutation(api.developer.createApiKey, {
      institutionId: otherInstitution,
      name: "Other writer",
      scopes: ["read", "write"],
    });
    const crossTenant = await t.fetch(`/api/v1/pledges/${pledgeId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${otherKey.secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ stage: "declined" }),
    });
    expect(crossTenant.status).toBe(404);

    // Bad bodies get structured 400s.
    const badStage = await t.fetch(`/api/v1/pledges/${pledgeId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${writeKey.secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ stage: "maybe" }),
    });
    expect(badStage.status).toBe(400);
    const badGift = await t.fetch(`/api/v1/pledges/${pledgeId}/gifts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${writeKey.secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ amountMinor: -5, occurredAt: "2026-09-15" }),
    });
    expect(badGift.status).toBe(400);
  });

  test("bad parameters get structured 400s", async () => {
    expect((await get("/api/v1/analytics/households?metric=vibes")).status).toBe(400);
    expect((await get("/api/v1/analytics/households?min=lots")).status).toBe(400);
    expect((await get("/api/v1/analytics/households?limit=9999")).status).toBe(400);
    expect((await get("/api/v1/analytics/categories?from=January")).status).toBe(400);
    expect((await get("/api/v1/pledges?stage=maybe")).status).toBe(400);
  });
});
