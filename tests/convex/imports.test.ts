import { mapAccountsCsv, mapPeopleCsv, mapTransactionsCsv } from "@shulstack/platform";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { type Backend, createBackend, createInstitutionAs, firstPage, signUp } from "./helpers";

const ACCOUNTS_CSV = `ID,Name,Account Type,Date Joined,Balance,Address,City,State,Zip,Email
101,"Cohen, David & Rachel",Family,9/15/2019,"$425.00","12 Elm St",Denver,CO,80203,cohens@example.com
102,Goldberg Miriam,Individual,6/22/2015,"(18.00)",,,,,`;

const PEOPLE_CSV = `ID,Account ID,First Name,Last Name,Gender,Relationship,Is Primary Contact,Email,Mobile
201,101,David,Cohen,M,Head,Yes,david@example.com,555-1234
202,101,Rachel,Cohen,F,Spouse,No,,
203,999,Orphan,Person,,Child,No,,`;

const TRANSACTIONS_CSV = `Date,ID,Type,Notes,Charge,Payment,"Account ID","Reversal Type"
2026-01-15,C101,Membership,Annual dues,1800.00,,101,
2026-02-01,P201,Credit Card,,,1000.00,101,
2026-03-01,C102,Donation,,-300.00,,102,Adjustment
2026-06-01,C999,Donation,,50.00,,999,`;

describe("ShulCloud import", () => {
  let t: Backend;
  let admin: Awaited<ReturnType<typeof signUp>>;
  let institutionId: Id<"institutions">;

  beforeEach(async () => {
    vi.useFakeTimers();
    t = createBackend();
    admin = await signUp(t, "admin@example.com");
    institutionId = await createInstitutionAs(admin.as);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function mappedAccounts() {
    return mapAccountsCsv(ACCOUNTS_CSV).accounts;
  }
  function mappedPeople() {
    return mapPeopleCsv(PEOPLE_CSV).people;
  }

  test("rejects oversized batches", async () => {
    const oversized = Array.from({ length: 101 }, (_, index) => ({
      externalId: `acct-${index}`,
      displayName: `Household ${index}`,
      isActive: true,
      metadata: {},
    }));
    await expect(
      admin.as.mutation(api.imports.importAccounts, { institutionId, accounts: oversized }),
    ).rejects.toThrow(/limited/);
  });

  test("imports accounts with balances, addresses, and contact points", async () => {
    const result = await admin.as.mutation(api.imports.importAccounts, {
      institutionId,
      accounts: mappedAccounts(),
    });
    expect(result).toEqual({ created: 2, updated: 0 });

    const page = await admin.as.query(api.crm.listHouseholds, {
      institutionId,
      paginationOpts: firstPage,
    });
    expect(page.page).toHaveLength(2);

    const cohen = page.page.find((h) => h.displayName === "Cohen, David & Rachel");
    expect(cohen).toBeDefined();
    if (cohen === undefined) throw new Error("unreachable");
    expect(cohen.joinedAt).toBe("2019-09-15");

    const finance = await admin.as.query(api.finance.getHouseholdFinance, {
      householdId: cohen._id,
    });
    expect(finance?.profile?.balanceMinor).toBe(42_500);

    const addresses = await t.run(async (ctx) =>
      (await ctx.db.query("householdAddresses").collect()).filter(
        (row) => row.householdId === cohen._id,
      ),
    );
    expect(addresses).toHaveLength(1);
    expect(addresses[0]).toMatchObject({ address1: "12 Elm St", city: "Denver" });
  });

  test("re-importing updates in place without duplicating or re-applying balances", async () => {
    await admin.as.mutation(api.imports.importAccounts, {
      institutionId,
      accounts: mappedAccounts(),
    });
    const renamed = mappedAccounts().map((account) =>
      account.externalId === "101" ? { ...account, displayName: "Cohen Family" } : account,
    );
    const second = await admin.as.mutation(api.imports.importAccounts, {
      institutionId,
      accounts: renamed,
    });
    expect(second).toEqual({ created: 0, updated: 2 });

    const page = await admin.as.query(api.crm.listHouseholds, {
      institutionId,
      paginationOpts: firstPage,
    });
    expect(page.page).toHaveLength(2);
    const cohen = page.page.find((h) => h.displayName === "Cohen Family");
    expect(cohen).toBeDefined();
    if (cohen === undefined) throw new Error("unreachable");

    // Balance applied exactly once despite two imports.
    const finance = await admin.as.query(api.finance.getHouseholdFinance, {
      householdId: cohen._id,
    });
    expect(finance?.profile?.balanceMinor).toBe(42_500);

    // Imported contact rows replaced, not duplicated.
    const contactPoints = await t.run(async (ctx) =>
      (await ctx.db.query("householdContactPoints").collect()).filter(
        (row) => row.householdId === cohen._id,
      ),
    );
    expect(contactPoints).toHaveLength(1);
  });

  test("imports people, links memberships, and warns on unknown accounts", async () => {
    await admin.as.mutation(api.imports.importAccounts, {
      institutionId,
      accounts: mappedAccounts(),
    });
    const result = await admin.as.mutation(api.imports.importPeople, {
      institutionId,
      people: mappedPeople(),
    });
    expect(result.created).toBe(3);
    expect(result.updated).toBe(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/account 999/);

    const search = await admin.as.query(api.crm.searchPeople, {
      institutionId,
      query: "David",
    });
    expect(search).toHaveLength(1);
    const david = search[0];
    if (david === undefined) throw new Error("unreachable");

    const details = await admin.as.query(api.crm.getPerson, { personId: david._id });
    expect(details?.memberships).toHaveLength(1);
    expect(details?.memberships[0]).toMatchObject({ role: "head", isActive: true });

    const contactPoints = await t.run(async (ctx) =>
      (await ctx.db.query("personContactPoints").collect()).filter(
        (row) => row.personId === david._id,
      ),
    );
    expect(contactPoints).toHaveLength(2);

    // The orphan person exists but has no household membership.
    const orphan = await admin.as.query(api.crm.searchPeople, {
      institutionId,
      query: "Orphan",
    });
    expect(orphan).toHaveLength(1);

    // Re-import people: everything updates, nothing duplicates.
    const second = await admin.as.mutation(api.imports.importPeople, {
      institutionId,
      people: mappedPeople(),
    });
    expect(second.created).toBe(0);
    expect(second.updated).toBe(3);
    const membershipRows = await t.run(async (ctx) =>
      (await ctx.db.query("householdMembers").collect()).filter(
        (row) => row.institutionId === institutionId,
      ),
    );
    expect(membershipRows).toHaveLength(2);
  });

  test("imports transactions onto ledgers and absorbs imported opening balances", async () => {
    await admin.as.mutation(api.imports.importAccounts, {
      institutionId,
      accounts: mappedAccounts(),
    });
    const { transactions, issues } = mapTransactionsCsv(TRANSACTIONS_CSV);
    expect(issues).toHaveLength(0);

    const result = await admin.as.mutation(api.imports.importTransactions, {
      institutionId,
      transactions,
    });
    expect(result).toMatchObject({ created: 3, skipped: 0, unmatched: 1 });
    expect(result.warnings[0]).toMatch(/account 999/);

    const page = await admin.as.query(api.crm.listHouseholds, {
      institutionId,
      paginationOpts: firstPage,
    });
    const cohen = page.page.find((h) => h.displayName === "Cohen, David & Rachel");
    const goldberg = page.page.find((h) => h.displayName === "Goldberg Miriam");
    if (cohen === undefined || goldberg === undefined) throw new Error("unreachable");

    // The ShulCloud totals are preserved: detail replaced the summary.
    const cohenFinance = await admin.as.query(api.finance.getHouseholdFinance, {
      householdId: cohen._id,
    });
    expect(cohenFinance?.profile?.balanceMinor).toBe(42_500);
    const goldbergFinance = await admin.as.query(api.finance.getHouseholdFinance, {
      householdId: goldberg._id,
    });
    expect(goldbergFinance?.profile?.balanceMinor).toBe(-1_800);

    // Cohen: opening + charge + payment; opening shrank by the imported deltas.
    const cohenEntries = await admin.as.query(api.ledger.listLedgerEntries, {
      householdId: cohen._id,
      paginationOpts: firstPage,
    });
    expect(cohenEntries.page).toHaveLength(3);
    const opening = cohenEntries.page.find((entry) => entry.entryType === "opening_balance");
    expect(opening).toMatchObject({
      amountMinor: 42_500 - (180_000 - 100_000),
      memo: "Balance before imported transaction history",
    });
    expect(cohenEntries.page.find((entry) => entry.entryType === "payment")).toMatchObject({
      method: "Credit Card",
      amountMinor: 100_000,
    });
    expect(cohenEntries.page.find((entry) => entry.entryType === "charge")).toMatchObject({
      category: "Membership",
      memo: "Annual dues",
    });

    // Goldberg's negative charge landed as a credit.
    const goldbergEntries = await admin.as.query(api.ledger.listLedgerEntries, {
      householdId: goldberg._id,
      paginationOpts: firstPage,
    });
    expect(goldbergEntries.page.find((entry) => entry.entryType === "credit")).toMatchObject({
      amountMinor: 30_000,
      memo: "Adjustment",
    });

    // The books tie out.
    const report = await admin.as.query(api.finance.reconcileBalances, { institutionId });
    expect(report.mismatches).toEqual([]);

    // Re-running skips everything already imported and changes nothing.
    const second = await admin.as.mutation(api.imports.importTransactions, {
      institutionId,
      transactions,
    });
    expect(second).toMatchObject({ created: 0, skipped: 3, unmatched: 1 });
    const cohenAfter = await admin.as.query(api.finance.getHouseholdFinance, {
      householdId: cohen._id,
    });
    expect(cohenAfter?.profile?.balanceMinor).toBe(42_500);
    const cohenEntriesAfter = await admin.as.query(api.ledger.listLedgerEntries, {
      householdId: cohen._id,
      paginationOpts: firstPage,
    });
    expect(cohenEntriesAfter.page).toHaveLength(3);
  });

  test("households without an imported opening balance accumulate transaction history", async () => {
    await admin.as.mutation(api.imports.importAccounts, {
      institutionId,
      accounts: mapAccountsCsv("ID,Name\n201,No Balance Family").accounts,
    });
    const { transactions } = mapTransactionsCsv(
      `Date,ID,Type,Charge,Payment,"Account ID"\n2026-05-01,C301,Membership,50.00,,201`,
    );
    const result = await admin.as.mutation(api.imports.importTransactions, {
      institutionId,
      transactions,
    });
    expect(result).toMatchObject({ created: 1, skipped: 0, unmatched: 0 });

    const page = await admin.as.query(api.crm.listHouseholds, {
      institutionId,
      paginationOpts: firstPage,
    });
    const household = page.page.find((h) => h.displayName === "No Balance Family");
    if (household === undefined) throw new Error("unreachable");
    const finance = await admin.as.query(api.finance.getHouseholdFinance, {
      householdId: household._id,
    });
    expect(finance?.profile?.balanceMinor).toBe(5_000);
    const entries = await admin.as.query(api.ledger.listLedgerEntries, {
      householdId: household._id,
      paginationOpts: firstPage,
    });
    expect(entries.page).toHaveLength(1);
    expect(entries.page[0]?.entryType).toBe("charge");
  });

  test("import requires the admin role and the right institution", async () => {
    const staffer = await signUp(t, "staff@example.com");
    await admin.as.mutation(api.platform.addStaffByEmail, {
      institutionId,
      email: "staff@example.com",
      role: "staff",
    });
    await expect(
      staffer.as.mutation(api.imports.importAccounts, {
        institutionId,
        accounts: mappedAccounts(),
      }),
    ).rejects.toThrow(/admin/);

    const outsider = await signUp(t, "outsider@example.com");
    await createInstitutionAs(outsider.as, "other-shul", "Other Shul");
    await expect(
      outsider.as.mutation(api.imports.importPeople, { institutionId, people: mappedPeople() }),
    ).rejects.toThrow(/access/);
  });
});
