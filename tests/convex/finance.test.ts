import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { type Backend, createBackend, createInstitutionAs, signUp } from "./helpers";

describe("household finance", () => {
  let t: Backend;
  let staff: Awaited<ReturnType<typeof signUp>>;
  let institutionId: Id<"institutions">;
  let householdId: Id<"households">;

  beforeEach(async () => {
    vi.useFakeTimers();
    t = createBackend();
    staff = await signUp(t, "staff@example.com");
    institutionId = await createInstitutionAs(staff.as);
    householdId = await staff.as.mutation(api.crm.createHousehold, {
      institutionId,
      displayName: "Cohen Family",
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("balances must be integers in minor units", async () => {
    await expect(
      staff.as.mutation(api.finance.upsertHouseholdBillingProfile, {
        householdId,
        balanceMinor: 12.5,
      }),
    ).rejects.toThrow(/minor units/);
    await expect(
      staff.as.mutation(api.finance.recordBalanceSnapshot, {
        householdId,
        asOfDate: "2026-07-01",
        balanceMinor: Number.MAX_SAFE_INTEGER + 1,
      }),
    ).rejects.toThrow(/minor units/);
  });

  test("snapshots create the profile on demand and advance the live balance", async () => {
    await staff.as.mutation(api.finance.recordBalanceSnapshot, {
      householdId,
      asOfDate: "2026-06-01",
      balanceMinor: 10_000,
    });
    let finance = await staff.as.query(api.finance.getHouseholdFinance, { householdId });
    expect(finance?.profile).toMatchObject({ balanceMinor: 10_000, balanceAsOf: "2026-06-01" });

    // A newer snapshot advances the live balance...
    await staff.as.mutation(api.finance.recordBalanceSnapshot, {
      householdId,
      asOfDate: "2026-07-01",
      balanceMinor: 4_500,
    });
    // ...but a backdated one does not.
    await staff.as.mutation(api.finance.recordBalanceSnapshot, {
      householdId,
      asOfDate: "2026-01-01",
      balanceMinor: 99_999,
    });

    finance = await staff.as.query(api.finance.getHouseholdFinance, { householdId });
    expect(finance?.profile).toMatchObject({ balanceMinor: 4_500, balanceAsOf: "2026-07-01" });
    expect(finance?.snapshots.map((s) => s.asOfDate)).toEqual([
      "2026-07-01",
      "2026-06-01",
      "2026-01-01",
    ]);
  });

  test("re-recording the same date overwrites instead of duplicating", async () => {
    await staff.as.mutation(api.finance.recordBalanceSnapshot, {
      householdId,
      asOfDate: "2026-07-01",
      balanceMinor: 1_000,
    });
    await staff.as.mutation(api.finance.recordBalanceSnapshot, {
      householdId,
      asOfDate: "2026-07-01",
      balanceMinor: 2_000,
    });
    const finance = await staff.as.query(api.finance.getHouseholdFinance, { householdId });
    expect(finance?.snapshots).toHaveLength(1);
    expect(finance?.snapshots[0]?.balanceMinor).toBe(2_000);
    expect(finance?.profile?.balanceMinor).toBe(2_000);
  });

  test("profile upserts preserve unspecified fields", async () => {
    await staff.as.mutation(api.finance.upsertHouseholdBillingProfile, {
      householdId,
      balanceMinor: 5_000,
      deliveryMethod: "email",
    });
    await staff.as.mutation(api.finance.upsertHouseholdBillingProfile, {
      householdId,
      discountNotes: "Clergy discount",
    });
    const finance = await staff.as.query(api.finance.getHouseholdFinance, { householdId });
    expect(finance?.profile).toMatchObject({
      balanceMinor: 5_000,
      deliveryMethod: "email",
      discountNotes: "Clergy discount",
    });
  });
});
