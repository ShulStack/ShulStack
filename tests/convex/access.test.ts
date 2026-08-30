import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api } from "../../convex/_generated/api";
import { createBackend, createInstitutionAs, firstPage, signUp } from "./helpers";

describe("authentication gates", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("anonymous users cannot create institutions", async () => {
    const t = createBackend();
    await expect(
      t.mutation(api.platform.createInstitution, { slug: "shul", name: "Shul" }),
    ).rejects.toThrow(/signed in/);
  });

  test("anonymous users cannot read CRM data", async () => {
    const t = createBackend();
    const owner = await signUp(t, "owner@example.com");
    const institutionId = await createInstitutionAs(owner.as);
    await expect(
      t.query(api.crm.listHouseholds, { institutionId, paginationOpts: firstPage }),
    ).rejects.toThrow(/signed in/);
    await expect(t.query(api.platform.listStaff, { institutionId })).rejects.toThrow(/signed in/);
  });

  test("signed-in users without a membership cannot touch an institution", async () => {
    const t = createBackend();
    const owner = await signUp(t, "owner@example.com");
    const institutionId = await createInstitutionAs(owner.as);
    const outsider = await signUp(t, "outsider@example.com");

    await expect(
      outsider.as.query(api.crm.listHouseholds, { institutionId, paginationOpts: firstPage }),
    ).rejects.toThrow(/access/);
    await expect(
      outsider.as.mutation(api.crm.createHousehold, { institutionId, displayName: "Intruders" }),
    ).rejects.toThrow(/access/);
    await expect(
      outsider.as.query(api.platform.getWorkspace, { slug: "beth-test" }),
    ).resolves.toBeNull();
  });

  test("staff of one institution cannot reach into another", async () => {
    const t = createBackend();
    const ownerA = await signUp(t, "a@example.com");
    const institutionA = await createInstitutionAs(ownerA.as, "shul-a", "Shul A");
    const ownerB = await signUp(t, "b@example.com");
    await createInstitutionAs(ownerB.as, "shul-b", "Shul B");

    const householdId = await ownerA.as.mutation(api.crm.createHousehold, {
      institutionId: institutionA,
      displayName: "Cohen Family",
    });

    await expect(
      ownerB.as.query(api.crm.listPeople, {
        institutionId: institutionA,
        paginationOpts: firstPage,
      }),
    ).rejects.toThrow(/access/);
    // Doc-scoped reads answer null for another tenant's ID, exactly as if it
    // did not exist, so IDs cannot be probed for existence.
    expect(await ownerB.as.query(api.crm.getHousehold, { householdId })).toBeNull();
    await expect(
      ownerB.as.mutation(api.crm.updateHousehold, { householdId, displayName: "Hijacked" }),
    ).rejects.toThrow(/access/);
    await expect(
      ownerB.as.mutation(api.finance.recordBalanceSnapshot, {
        householdId,
        asOfDate: "2026-07-01",
      }),
    ).rejects.toThrow(/access/);
  });
});

describe("role enforcement", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function setUpWithStaff() {
    const t = createBackend();
    const owner = await signUp(t, "owner@example.com");
    const institutionId = await createInstitutionAs(owner.as);
    const staffer = await signUp(t, "staff@example.com");
    await owner.as.mutation(api.platform.addStaffByEmail, {
      institutionId,
      email: "staff@example.com",
      role: "staff",
    });
    return { t, owner, staffer, institutionId };
  }

  test("staff can read and write CRM but not administer", async () => {
    const { staffer, institutionId } = await setUpWithStaff();

    const householdId = await staffer.as.mutation(api.crm.createHousehold, {
      institutionId,
      displayName: "Levi Family",
    });
    expect(householdId).toBeDefined();

    await expect(
      staffer.as.mutation(api.platform.setModuleEnabled, {
        institutionId,
        moduleSlug: "events",
        enabled: true,
      }),
    ).rejects.toThrow(/admin/);
    await expect(
      staffer.as.mutation(api.platform.addStaffByEmail, {
        institutionId,
        email: "owner@example.com",
        role: "staff",
      }),
    ).rejects.toThrow(/admin/);
    await expect(
      staffer.as.mutation(api.content.upsertPage, {
        institutionId,
        slug: "about",
        title: "About",
      }),
    ).rejects.toThrow(/admin/);
  });

  test("only the owner can grant the admin role", async () => {
    const { t, owner, institutionId } = await setUpWithStaff();
    const admin = await signUp(t, "admin@example.com");
    await owner.as.mutation(api.platform.addStaffByEmail, {
      institutionId,
      email: "admin@example.com",
      role: "admin",
    });

    await signUp(t, "newbie@example.com");
    await expect(
      admin.as.mutation(api.platform.addStaffByEmail, {
        institutionId,
        email: "newbie@example.com",
        role: "admin",
      }),
    ).rejects.toThrow(/owner/);
    // Admins can still add plain staff.
    await admin.as.mutation(api.platform.addStaffByEmail, {
      institutionId,
      email: "newbie@example.com",
      role: "staff",
    });
  });

  test("nobody can be granted ownership through staff management", async () => {
    const { owner, institutionId } = await setUpWithStaff();
    await expect(
      owner.as.mutation(api.platform.addStaffByEmail, {
        institutionId,
        email: "staff@example.com",
        role: "owner",
      }),
    ).rejects.toThrow(/[Oo]wnership/);
  });

  test("deactivated staff immediately lose access", async () => {
    const { owner, staffer, institutionId } = await setUpWithStaff();
    const staffList = await owner.as.query(api.platform.listStaff, { institutionId });
    const stafferRow = staffList.find((member) => member.email === "staff@example.com");
    expect(stafferRow).toBeDefined();
    if (stafferRow === undefined) throw new Error("unreachable");

    await owner.as.mutation(api.platform.setStaffActive, {
      staffMemberId: stafferRow.staffMemberId,
      isActive: false,
    });
    await expect(
      staffer.as.query(api.crm.listHouseholds, { institutionId, paginationOpts: firstPage }),
    ).rejects.toThrow(/access/);
  });

  test("only the owner can demote or deactivate an admin", async () => {
    const { t, owner, institutionId } = await setUpWithStaff();
    const adminOne = await signUp(t, "admin-one@example.com");
    await signUp(t, "admin-two@example.com");
    for (const email of ["admin-one@example.com", "admin-two@example.com"]) {
      await owner.as.mutation(api.platform.addStaffByEmail, {
        institutionId,
        email,
        role: "admin",
      });
    }
    const staffList = await owner.as.query(api.platform.listStaff, { institutionId });
    const adminTwoRow = staffList.find((member) => member.email === "admin-two@example.com");
    if (adminTwoRow === undefined) throw new Error("unreachable");

    await expect(
      adminOne.as.mutation(api.platform.addStaffByEmail, {
        institutionId,
        email: "admin-two@example.com",
        role: "staff",
      }),
    ).rejects.toThrow(/owner/);
    await expect(
      adminOne.as.mutation(api.platform.setStaffActive, {
        staffMemberId: adminTwoRow.staffMemberId,
        isActive: false,
      }),
    ).rejects.toThrow(/owner/);

    // The owner can do both.
    await owner.as.mutation(api.platform.addStaffByEmail, {
      institutionId,
      email: "admin-two@example.com",
      role: "staff",
    });
    const after = await owner.as.query(api.platform.listStaff, { institutionId });
    expect(after.find((member) => member.email === "admin-two@example.com")?.role).toBe("staff");
  });

  test("the owner cannot be deactivated and admins cannot deactivate themselves", async () => {
    const { t, owner, institutionId } = await setUpWithStaff();
    const admin = await signUp(t, "admin@example.com");
    await owner.as.mutation(api.platform.addStaffByEmail, {
      institutionId,
      email: "admin@example.com",
      role: "admin",
    });
    const staffList = await owner.as.query(api.platform.listStaff, { institutionId });
    const ownerRow = staffList.find((member) => member.role === "owner");
    const adminRow = staffList.find((member) => member.email === "admin@example.com");
    if (ownerRow === undefined || adminRow === undefined) throw new Error("unreachable");

    await expect(
      admin.as.mutation(api.platform.setStaffActive, {
        staffMemberId: ownerRow.staffMemberId,
        isActive: false,
      }),
    ).rejects.toThrow(/owner/);
    await expect(
      admin.as.mutation(api.platform.setStaffActive, {
        staffMemberId: adminRow.staffMemberId,
        isActive: false,
      }),
    ).rejects.toThrow(/yourself/);
  });
});
