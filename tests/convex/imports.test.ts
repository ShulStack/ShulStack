import { mapAccountsCsv, mapPeopleCsv } from "@shulstack/platform";
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
