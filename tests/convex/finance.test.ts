import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { type Backend, createBackend, createInstitutionAs, signUp } from "./helpers";

describe("household finance", () => {
  let t: Backend;
  let owner: Awaited<ReturnType<typeof signUp>>;
  let institutionId: Id<"institutions">;
  let householdId: Id<"households">;

  beforeEach(async () => {
    vi.useFakeTimers();
    t = createBackend();
    owner = await signUp(t, "owner@example.com");
    institutionId = await createInstitutionAs(owner.as);
    householdId = await owner.as.mutation(api.crm.createHousehold, {
      institutionId,
      displayName: "Cohen Family",
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function addEntry(
    entryType: "charge" | "payment" | "credit",
    amountMinor: number,
    occurredAt: string,
  ) {
    await owner.as.mutation(api.ledger.addLedgerEntry, {
      householdId,
      entryType,
      amountMinor,
      occurredAt,
    });
  }

  async function profile() {
    const finance = await owner.as.query(api.finance.getHouseholdFinance, { householdId });
    return finance?.profile ?? null;
  }

  test("billing profiles cannot set balances directly", async () => {
    await expect(
      owner.as.mutation(api.finance.upsertHouseholdBillingProfile, {
        householdId,
        // @ts-expect-error balanceMinor is deliberately not an accepted argument
        balanceMinor: 12_345,
      }),
    ).rejects.toThrow();

    await owner.as.mutation(api.finance.upsertHouseholdBillingProfile, {
      householdId,
      deliveryMethod: "email",
    });
    expect((await profile())?.balanceMinor).toBe(0);
  });

  test("profile upserts preserve unspecified fields", async () => {
    await owner.as.mutation(api.finance.upsertHouseholdBillingProfile, {
      householdId,
      deliveryMethod: "email",
    });
    await owner.as.mutation(api.finance.upsertHouseholdBillingProfile, {
      householdId,
      discountNotes: "Clergy discount",
    });
    expect(await profile()).toMatchObject({
      deliveryMethod: "email",
      discountNotes: "Clergy discount",
      balanceMinor: 0,
    });
  });

  test("snapshots record the ledger-derived balance and never move it", async () => {
    await addEntry("charge", 10_000, "2026-06-15");
    await addEntry("payment", 4_000, "2026-06-20");

    await owner.as.mutation(api.finance.recordBalanceSnapshot, {
      householdId,
      asOfDate: "2026-07-01",
    });
    let finance = await owner.as.query(api.finance.getHouseholdFinance, { householdId });
    expect(finance?.snapshots).toEqual([
      expect.objectContaining({ asOfDate: "2026-07-01", balanceMinor: 6_000 }),
    ]);
    expect(finance?.profile).toMatchObject({ balanceMinor: 6_000, balanceAsOf: "2026-06-20" });

    await addEntry("charge", 1_000, "2026-07-02");
    await owner.as.mutation(api.finance.recordBalanceSnapshot, {
      householdId,
      asOfDate: "2026-08-01",
    });
    finance = await owner.as.query(api.finance.getHouseholdFinance, { householdId });
    expect(finance?.snapshots.map((s) => [s.asOfDate, s.balanceMinor])).toEqual([
      ["2026-08-01", 7_000],
      ["2026-07-01", 6_000],
    ]);
    // The live balance is owned by the ledger, not by snapshots.
    expect(finance?.profile).toMatchObject({ balanceMinor: 7_000, balanceAsOf: "2026-07-02" });
  });

  test("re-recording the same date overwrites instead of duplicating", async () => {
    await addEntry("charge", 1_000, "2026-06-01");
    await owner.as.mutation(api.finance.recordBalanceSnapshot, {
      householdId,
      asOfDate: "2026-07-01",
    });
    await addEntry("charge", 500, "2026-06-02");
    await owner.as.mutation(api.finance.recordBalanceSnapshot, {
      householdId,
      asOfDate: "2026-07-01",
    });
    const finance = await owner.as.query(api.finance.getHouseholdFinance, { householdId });
    expect(finance?.snapshots).toHaveLength(1);
    expect(finance?.snapshots[0]?.balanceMinor).toBe(1_500);
  });

  test("backdated entries adjust the balance without regressing balanceAsOf", async () => {
    await addEntry("charge", 10_000, "2026-07-01");
    await addEntry("credit", 2_000, "2026-01-15");
    expect(await profile()).toMatchObject({ balanceMinor: 8_000, balanceAsOf: "2026-07-01" });
  });

  test("dates are validated as real calendar dates", async () => {
    await expect(
      owner.as.mutation(api.finance.recordBalanceSnapshot, {
        householdId,
        asOfDate: "banana",
      }),
    ).rejects.toThrow(/YYYY-MM-DD/);
    await expect(
      owner.as.mutation(api.finance.recordBalanceSnapshot, {
        householdId,
        asOfDate: "2026-02-30",
      }),
    ).rejects.toThrow(/calendar date/);
    await expect(
      owner.as.mutation(api.ledger.addLedgerEntry, {
        householdId,
        entryType: "charge",
        amountMinor: 100,
        occurredAt: "2026-13-01",
      }),
    ).rejects.toThrow(/calendar date/);
  });

  test("currency is validated and locked once ledger entries exist", async () => {
    await owner.as.mutation(api.finance.upsertHouseholdBillingProfile, {
      householdId,
      currency: "cad",
    });
    expect((await profile())?.currency).toBe("CAD");

    await expect(
      owner.as.mutation(api.finance.upsertHouseholdBillingProfile, {
        householdId,
        currency: "dollars",
      }),
    ).rejects.toThrow(/three-letter/);

    await addEntry("charge", 100, "2026-07-01");
    await expect(
      owner.as.mutation(api.finance.upsertHouseholdBillingProfile, {
        householdId,
        currency: "ILS",
      }),
    ).rejects.toThrow(/cannot change/);
  });

  test("reconcile detects drift and repair restores the ledger sum", async () => {
    await addEntry("charge", 5_000, "2026-07-01");
    await addEntry("payment", 2_000, "2026-07-02");

    let report = await owner.as.query(api.finance.reconcileBalances, { institutionId });
    expect(report.mismatches).toEqual([]);
    expect(report.entriesChecked).toBe(2);

    // Simulate the class of bug this exists to catch: a balance written
    // outside the ledger (e.g. a manual dashboard edit).
    await t.run(async (ctx) => {
      const drifted = await ctx.db
        .query("householdBillingProfiles")
        .withIndex("by_household", (q) => q.eq("householdId", householdId))
        .unique();
      if (drifted === null) throw new Error("profile missing");
      await ctx.db.patch(drifted._id, { balanceMinor: 9_999 });
    });

    report = await owner.as.query(api.finance.reconcileBalances, { institutionId });
    expect(report.mismatches).toEqual([{ householdId, balanceMinor: 9_999, ledgerMinor: 3_000 }]);

    await owner.as.mutation(api.finance.repairHouseholdBalance, { householdId });
    expect((await profile())?.balanceMinor).toBe(3_000);
    report = await owner.as.query(api.finance.reconcileBalances, { institutionId });
    expect(report.mismatches).toEqual([]);
  });

  test("reconcile and repair require the admin role", async () => {
    const staffer = await signUp(t, "staff@example.com");
    await owner.as.mutation(api.platform.addStaffByEmail, {
      institutionId,
      email: "staff@example.com",
      role: "staff",
    });
    await expect(
      staffer.as.query(api.finance.reconcileBalances, { institutionId }),
    ).rejects.toThrow(/admin/);
    await expect(
      staffer.as.mutation(api.finance.repairHouseholdBalance, { householdId }),
    ).rejects.toThrow(/admin/);
  });

  test("cross-institution finance reads resolve to null, not an error", async () => {
    const outsider = await signUp(t, "outsider@example.com");
    await createInstitutionAs(outsider.as, "other-shul", "Other Shul");
    expect(await outsider.as.query(api.finance.getHouseholdFinance, { householdId })).toBeNull();
  });
});
