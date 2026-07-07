import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  type Backend,
  createBackend,
  createInstitutionAs,
  firstPage,
  settleScheduled,
  signUp,
} from "./helpers";

describe("households and people", () => {
  let t: Backend;
  let staff: Awaited<ReturnType<typeof signUp>>;
  let institutionId: Id<"institutions">;

  beforeEach(async () => {
    vi.useFakeTimers();
    t = createBackend();
    staff = await signUp(t, "staff@example.com");
    institutionId = await createInstitutionAs(staff.as);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("created households appear in the paginated list", async () => {
    await staff.as.mutation(api.crm.createHousehold, {
      institutionId,
      displayName: "Cohen Family",
    });
    await staff.as.mutation(api.crm.createHousehold, {
      institutionId,
      displayName: "Levi Family",
    });

    const page = await staff.as.query(api.crm.listHouseholds, {
      institutionId,
      paginationOpts: firstPage,
    });
    expect(page.page.map((h) => h.displayName)).toEqual(["Levi Family", "Cohen Family"]);
  });

  test("household names cannot be blank", async () => {
    await expect(
      staff.as.mutation(api.crm.createHousehold, { institutionId, displayName: "   " }),
    ).rejects.toThrow(/required/);
  });

  test("creating a household provisions a billing profile via domain events", async () => {
    const householdId = await staff.as.mutation(api.crm.createHousehold, {
      institutionId,
      displayName: "Cohen Family",
    });
    await settleScheduled(t);

    const details = await staff.as.query(api.crm.getHousehold, { householdId });
    expect(details?.billingProfile).not.toBeNull();
    expect(details?.billingProfile).toMatchObject({ balanceMinor: 0, currency: "USD" });

    const events = await t.run(async (ctx) => await ctx.db.query("domainEvents").collect());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ eventName: "household.created", status: "processed" });
  });

  test("people get a computed display name that updates on edit", async () => {
    const personId = await staff.as.mutation(api.crm.createPerson, {
      institutionId,
      firstName: "David",
      lastName: "Cohen",
    });
    let details = await staff.as.query(api.crm.getPerson, { personId });
    expect(details?.person.displayName).toBe("David Cohen");

    await staff.as.mutation(api.crm.updatePerson, { personId, nickname: "Dudu" });
    details = await staff.as.query(api.crm.getPerson, { personId });
    expect(details?.person.displayName).toBe("Dudu Cohen");
  });

  test("search finds people by name within the institution only", async () => {
    await staff.as.mutation(api.crm.createPerson, {
      institutionId,
      firstName: "Miriam",
      lastName: "Goldberg",
    });
    const other = await signUp(t, "other@example.com");
    const otherInstitution = await createInstitutionAs(other.as, "other-shul", "Other Shul");
    await other.as.mutation(api.crm.createPerson, {
      institutionId: otherInstitution,
      firstName: "Miriam",
      lastName: "Katz",
    });

    const results = await staff.as.query(api.crm.searchPeople, {
      institutionId,
      query: "Miriam",
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.displayName).toBe("Miriam Goldberg");
  });

  test("household membership links people and dedupes", async () => {
    const householdId = await staff.as.mutation(api.crm.createHousehold, {
      institutionId,
      displayName: "Cohen Family",
    });
    const personId = await staff.as.mutation(api.crm.createPerson, {
      institutionId,
      firstName: "David",
      lastName: "Cohen",
    });

    await staff.as.mutation(api.crm.addHouseholdMember, {
      householdId,
      personId,
      role: "head",
    });
    // Adding again must not duplicate.
    await staff.as.mutation(api.crm.addHouseholdMember, { householdId, personId });

    const details = await staff.as.query(api.crm.getHousehold, { householdId });
    expect(details?.members).toHaveLength(1);
    expect(details?.members[0]).toMatchObject({ role: "head", isActive: true });

    const personDetails = await staff.as.query(api.crm.getPerson, { personId });
    expect(personDetails?.memberships).toHaveLength(1);
    expect(personDetails?.memberships[0]?.householdName).toBe("Cohen Family");
  });

  test("members cannot be linked across institutions", async () => {
    const householdId = await staff.as.mutation(api.crm.createHousehold, {
      institutionId,
      displayName: "Cohen Family",
    });
    const other = await signUp(t, "other@example.com");
    const otherInstitution = await createInstitutionAs(other.as, "other-shul", "Other Shul");
    const strangerId = await other.as.mutation(api.crm.createPerson, {
      institutionId: otherInstitution,
      firstName: "Stranger",
    });

    await expect(
      staff.as.mutation(api.crm.addHouseholdMember, { householdId, personId: strangerId }),
    ).rejects.toThrow(/different institutions/);
  });

  test("deactivating a member keeps history but marks it inactive", async () => {
    const householdId = await staff.as.mutation(api.crm.createHousehold, {
      institutionId,
      displayName: "Cohen Family",
    });
    const personId = await staff.as.mutation(api.crm.createPerson, {
      institutionId,
      firstName: "David",
    });
    const membershipId = await staff.as.mutation(api.crm.addHouseholdMember, {
      householdId,
      personId,
    });

    await staff.as.mutation(api.crm.setHouseholdMemberActive, { membershipId, isActive: false });
    const details = await staff.as.query(api.crm.getHousehold, { householdId });
    expect(details?.members).toHaveLength(1);
    expect(details?.members[0]?.isActive).toBe(false);
  });

  test("dashboard stats count only active records", async () => {
    const householdId = await staff.as.mutation(api.crm.createHousehold, {
      institutionId,
      displayName: "Cohen Family",
    });
    await staff.as.mutation(api.crm.createHousehold, { institutionId, displayName: "Levi Family" });
    await staff.as.mutation(api.crm.createPerson, { institutionId, firstName: "David" });
    await staff.as.mutation(api.crm.setHouseholdActive, { householdId, isActive: false });

    const stats = await staff.as.query(api.crm.dashboardStats, { institutionId });
    expect(stats).toEqual({ activeHouseholds: 1, activePeople: 1 });
  });

  test("mutations write an audit trail with the acting user", async () => {
    const householdId = await staff.as.mutation(api.crm.createHousehold, {
      institutionId,
      displayName: "Cohen Family",
    });
    await staff.as.mutation(api.crm.updateHousehold, {
      householdId,
      displayName: "Cohen-Katz Family",
    });

    const audit = await staff.as.query(api.platform.listRecentAuditLogs, { institutionId });
    const actions = audit
      .filter((entry) => entry.entityType === "household")
      .map((entry) => entry.action);
    expect(actions).toEqual(["update", "create"]);
    expect(audit[0]?.actorEmail).toBe("staff@example.com");
  });
});

describe("sample data seed", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("loads a demo dataset once, and only for admins", async () => {
    const t = createBackend();
    const owner = await signUp(t, "owner@example.com");
    const institutionId = await createInstitutionAs(owner.as);

    await owner.as.mutation(api.seed.loadSampleData, { institutionId });
    await settleScheduled(t);

    const page = await owner.as.query(api.crm.listHouseholds, {
      institutionId,
      paginationOpts: firstPage,
    });
    expect(page.page.length).toBeGreaterThanOrEqual(3);
    const stats = await owner.as.query(api.crm.dashboardStats, { institutionId });
    expect(stats.activePeople).toBeGreaterThanOrEqual(6);

    await expect(owner.as.mutation(api.seed.loadSampleData, { institutionId })).rejects.toThrow(
      /empty institution/,
    );
  });
});
