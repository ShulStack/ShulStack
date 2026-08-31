import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { type Backend, createBackend, createInstitutionAs, firstPage, signUp } from "./helpers";

describe("fundraising", () => {
  let t: Backend;
  let owner: Awaited<ReturnType<typeof signUp>>;
  let institutionId: Id<"institutions">;
  let campaignId: Id<"campaigns">;
  let householdId: Id<"households">;

  beforeEach(async () => {
    vi.useFakeTimers();
    t = createBackend();
    owner = await signUp(t, "owner@example.com");
    institutionId = await createInstitutionAs(owner.as);
    campaignId = await owner.as.mutation(api.fundraising.createCampaign, {
      institutionId,
      name: "Building Campaign",
      goalMinor: 10_000_000,
    });
    householdId = await owner.as.mutation(api.crm.createHousehold, {
      institutionId,
      displayName: "Cohen Family",
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("campaign creation requires admin; staff can work pledges", async () => {
    const staffer = await signUp(t, "staff@example.com");
    await owner.as.mutation(api.platform.addStaffByEmail, {
      institutionId,
      email: "staff@example.com",
      role: "staff",
    });
    await expect(
      staffer.as.mutation(api.fundraising.createCampaign, { institutionId, name: "Nope" }),
    ).rejects.toThrow(/admin/);

    const pledgeId = await staffer.as.mutation(api.fundraising.createPledge, {
      campaignId,
      householdId,
      amountMinor: 50_000,
    });
    expect(pledgeId).toBeDefined();
  });

  test("pledges validate campaign, household, and person tenancy", async () => {
    const outsider = await signUp(t, "outsider@example.com");
    const otherInstitution = await createInstitutionAs(outsider.as, "other-shul", "Other Shul");
    const foreignHousehold = await outsider.as.mutation(api.crm.createHousehold, {
      institutionId: otherInstitution,
      displayName: "Stranger Family",
    });
    const foreignPerson = await outsider.as.mutation(api.crm.createPerson, {
      institutionId: otherInstitution,
      firstName: "Stranger",
    });

    await expect(
      owner.as.mutation(api.fundraising.createPledge, {
        campaignId,
        householdId: foreignHousehold,
        amountMinor: 100,
      }),
    ).rejects.toThrow(/Household not found/);
    await expect(
      owner.as.mutation(api.fundraising.createPledge, {
        campaignId,
        householdId,
        personId: foreignPerson,
        amountMinor: 100,
      }),
    ).rejects.toThrow(/Person not found/);
    await expect(
      outsider.as.mutation(api.fundraising.createPledge, {
        campaignId,
        householdId,
        amountMinor: 100,
      }),
    ).rejects.toThrow(/access/);
  });

  test("payments hit the ledger net-zero, advance the stage, and reconcile", async () => {
    const pledgeId = await owner.as.mutation(api.fundraising.createPledge, {
      campaignId,
      householdId,
      amountMinor: 100_000,
      stage: "asked",
    });

    // Partial payment: asked → pledged, money lands as charge + payment.
    const partial = await owner.as.mutation(api.fundraising.recordPledgePayment, {
      pledgeId,
      amountMinor: 40_000,
      occurredAt: "2026-09-01",
      method: "check",
    });
    expect(partial).toEqual({ paidMinor: 40_000, stage: "pledged" });

    const finance = await owner.as.query(api.finance.getHouseholdFinance, { householdId });
    expect(finance?.profile?.balanceMinor).toBe(0);
    const entries = await owner.as.query(api.ledger.listLedgerEntries, {
      householdId,
      paginationOpts: firstPage,
    });
    expect(entries.page).toHaveLength(2);
    expect(entries.page.map((entry) => entry.entryType).sort()).toEqual(["charge", "payment"]);
    expect(entries.page.every((entry) => entry.category === "Building Campaign")).toBe(true);

    // Completing the pledge fulfills it.
    const full = await owner.as.mutation(api.fundraising.recordPledgePayment, {
      pledgeId,
      amountMinor: 60_000,
      occurredAt: "2026-10-01",
      method: "credit card",
    });
    expect(full).toEqual({ paidMinor: 100_000, stage: "fulfilled" });

    const report = await owner.as.query(api.finance.reconcileBalances, { institutionId });
    expect(report.mismatches).toEqual([]);

    await expect(
      owner.as.mutation(api.fundraising.recordPledgePayment, {
        pledgeId,
        amountMinor: -5,
        occurredAt: "2026-10-02",
      }),
    ).rejects.toThrow(/positive/);
  });

  test("campaign rollups count commitments and money raised", async () => {
    await owner.as.mutation(api.fundraising.createPledge, {
      campaignId,
      householdId,
      amountMinor: 100_000,
      stage: "pledged",
    });
    const prospect = await owner.as.mutation(api.fundraising.createPledge, {
      campaignId,
      householdId,
      amountMinor: 0,
      stage: "prospect",
    });
    await owner.as.mutation(api.fundraising.updatePledge, {
      pledgeId: prospect,
      stage: "declined",
    });

    const campaigns = await owner.as.query(api.fundraising.listCampaigns, { institutionId });
    expect(campaigns).toHaveLength(1);
    expect(campaigns[0]?.rollup).toEqual({
      pledgeCount: 2,
      openCount: 1,
      committedMinor: 100_000,
      raisedMinor: 0,
    });

    const detail = await owner.as.query(api.fundraising.getCampaign, { campaignId });
    expect(detail?.pledges).toHaveLength(2);
    expect(detail?.pledges[0]).toMatchObject({
      campaignName: "Building Campaign",
      householdName: "Cohen Family",
    });
  });

  test("pledges surface on people and households, null across tenants", async () => {
    const personId = await owner.as.mutation(api.crm.createPerson, {
      institutionId,
      firstName: "David",
      lastName: "Cohen",
    });
    await owner.as.mutation(api.fundraising.createPledge, {
      campaignId,
      householdId,
      personId,
      amountMinor: 25_000,
      stage: "asked",
    });

    const forPerson = await owner.as.query(api.fundraising.listPledgesForPerson, { personId });
    expect(forPerson).toHaveLength(1);
    expect(forPerson?.[0]).toMatchObject({
      campaignName: "Building Campaign",
      personName: "David Cohen",
      stage: "asked",
    });

    const forHousehold = await owner.as.query(api.fundraising.listPledgesForHousehold, {
      householdId,
    });
    expect(forHousehold).toHaveLength(1);

    const outsider = await signUp(t, "outsider@example.com");
    await createInstitutionAs(outsider.as, "other-shul", "Other Shul");
    expect(await outsider.as.query(api.fundraising.listPledgesForPerson, { personId })).toBeNull();
    expect(await outsider.as.query(api.fundraising.getCampaign, { campaignId })).toBeNull();
  });

  test("the institution-wide pledge list joins names for screening", async () => {
    await owner.as.mutation(api.fundraising.createPledge, {
      campaignId,
      householdId,
      amountMinor: 10_000,
      notes: "Met at kiddush",
    });
    const pledges = await owner.as.query(api.fundraising.listPledges, { institutionId });
    expect(pledges).toHaveLength(1);
    expect(pledges[0]).toMatchObject({
      campaignName: "Building Campaign",
      householdName: "Cohen Family",
      notes: "Met at kiddush",
      stage: "prospect",
    });
  });
});
