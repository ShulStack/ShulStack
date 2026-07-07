import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { type Backend, createBackend, createInstitutionAs, firstPage, signUp } from "./helpers";

describe("household ledger", () => {
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

  async function balance(): Promise<number | undefined> {
    const finance = await staff.as.query(api.finance.getHouseholdFinance, { householdId });
    return finance?.profile?.balanceMinor;
  }

  test("charges, payments, and credits move the balance", async () => {
    await staff.as.mutation(api.ledger.addLedgerEntry, {
      householdId,
      entryType: "charge",
      amountMinor: 180_000,
      occurredAt: "2026-07-01",
      category: "dues",
    });
    expect(await balance()).toBe(180_000);

    await staff.as.mutation(api.ledger.addLedgerEntry, {
      householdId,
      entryType: "payment",
      amountMinor: 100_000,
      occurredAt: "2026-07-02",
      method: "check",
    });
    expect(await balance()).toBe(80_000);

    await staff.as.mutation(api.ledger.addLedgerEntry, {
      householdId,
      entryType: "credit",
      amountMinor: 30_000,
      occurredAt: "2026-07-03",
      memo: "Clergy discount",
    });
    expect(await balance()).toBe(50_000);
  });

  test("opening balances carry a sign and create the profile", async () => {
    await staff.as.mutation(api.ledger.addLedgerEntry, {
      householdId,
      entryType: "opening_balance",
      amountMinor: -1_800,
      occurredAt: "2026-01-01",
    });
    expect(await balance()).toBe(-1_800);
  });

  test("amounts are validated", async () => {
    await expect(
      staff.as.mutation(api.ledger.addLedgerEntry, {
        householdId,
        entryType: "charge",
        amountMinor: 12.5,
        occurredAt: "2026-07-01",
      }),
    ).rejects.toThrow(/minor units/);
    await expect(
      staff.as.mutation(api.ledger.addLedgerEntry, {
        householdId,
        entryType: "payment",
        amountMinor: -5,
        occurredAt: "2026-07-01",
      }),
    ).rejects.toThrow(/positive/);
    await expect(
      staff.as.mutation(api.ledger.addLedgerEntry, {
        householdId,
        entryType: "charge",
        amountMinor: 100,
        occurredAt: "July 1",
      }),
    ).rejects.toThrow(/YYYY-MM-DD/);
  });

  test("entries list newest-date-first with pagination", async () => {
    for (const [occurredAt, amountMinor] of [
      ["2026-07-01", 100],
      ["2026-07-03", 300],
      ["2026-07-02", 200],
    ] as const) {
      await staff.as.mutation(api.ledger.addLedgerEntry, {
        householdId,
        entryType: "charge",
        amountMinor,
        occurredAt,
      });
    }
    const page = await staff.as.query(api.ledger.listLedgerEntries, {
      householdId,
      paginationOpts: firstPage,
    });
    expect(page.page.map((entry) => entry.occurredAt)).toEqual([
      "2026-07-03",
      "2026-07-02",
      "2026-07-01",
    ]);
  });

  test("payments emit a payment.recorded domain event", async () => {
    await staff.as.mutation(api.ledger.addLedgerEntry, {
      householdId,
      entryType: "payment",
      amountMinor: 5_000,
      occurredAt: "2026-07-01",
    });
    const events = await t.run(async (ctx) => await ctx.db.query("domainEvents").collect());
    expect(events.some((event) => event.eventName === "payment.recorded")).toBe(true);
  });

  test("outsiders cannot read or write the ledger", async () => {
    const outsider = await signUp(t, "outsider@example.com");
    await createInstitutionAs(outsider.as, "other-shul", "Other Shul");
    await expect(
      outsider.as.mutation(api.ledger.addLedgerEntry, {
        householdId,
        entryType: "charge",
        amountMinor: 100,
        occurredAt: "2026-07-01",
      }),
    ).rejects.toThrow(/access/);
    await expect(
      outsider.as.query(api.ledger.listLedgerEntries, { householdId, paginationOpts: firstPage }),
    ).rejects.toThrow(/access/);
  });

  test("sample data records opening balances through the ledger", async () => {
    const fresh = await signUp(t, "owner2@example.com");
    const freshInstitution = await createInstitutionAs(fresh.as, "seeded-shul", "Seeded Shul");
    await fresh.as.mutation(api.seed.loadSampleData, { institutionId: freshInstitution });

    const entries = await t.run(async (ctx) =>
      (await ctx.db.query("ledgerEntries").collect()).filter(
        (entry) => entry.institutionId === freshInstitution,
      ),
    );
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries.every((entry) => entry.entryType === "opening_balance")).toBe(true);
  });
});
