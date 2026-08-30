import { DEFAULT_ENABLED_MODULES, MODULES } from "@shulstack/platform";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api } from "../../convex/_generated/api";
import { createBackend, createInstitutionAs, signUp } from "./helpers";

describe("institution lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("creating an institution makes the creator its owner", async () => {
    const t = createBackend();
    const owner = await signUp(t, "founder@example.com");
    await createInstitutionAs(owner.as, "beth-shalom", "Beth Shalom");

    const mine = await owner.as.query(api.platform.listMyInstitutions, {});
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ slug: "beth-shalom", name: "Beth Shalom", role: "owner" });
  });

  test("default module enablement matches the platform registry", async () => {
    const t = createBackend();
    const owner = await signUp(t, "founder@example.com");
    await createInstitutionAs(owner.as, "beth-shalom", "Beth Shalom");

    const workspace = await owner.as.query(api.platform.getWorkspace, { slug: "beth-shalom" });
    expect(workspace).not.toBeNull();
    if (workspace === null) throw new Error("unreachable");
    expect(workspace.modules).toHaveLength(MODULES.length);
    for (const module of workspace.modules) {
      expect(module.enabled).toBe(DEFAULT_ENABLED_MODULES.includes(module.slug));
    }
  });

  test("slugs are validated and unique", async () => {
    const t = createBackend();
    const owner = await signUp(t, "founder@example.com");
    await expect(
      owner.as.mutation(api.platform.createInstitution, { slug: "Bad Slug!", name: "X" }),
    ).rejects.toThrow(/[Ss]lug/);
    await createInstitutionAs(owner.as, "taken", "First");
    await expect(
      owner.as.mutation(api.platform.createInstitution, { slug: "taken", name: "Second" }),
    ).rejects.toThrow(/already exists/);
  });

  test("ALLOW_NEW_INSTITUTIONS=false closes institution creation", async () => {
    vi.stubEnv("ALLOW_NEW_INSTITUTIONS", "false");
    try {
      const t = createBackend();
      const user = await signUp(t, "founder@example.com");
      await expect(
        user.as.mutation(api.platform.createInstitution, { slug: "closed", name: "Closed" }),
      ).rejects.toThrow(/not accepting/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test("module toggles persist and are audited", async () => {
    const t = createBackend();
    const owner = await signUp(t, "founder@example.com");
    const institutionId = await createInstitutionAs(owner.as, "beth-shalom", "Beth Shalom");

    await owner.as.mutation(api.platform.setModuleEnabled, {
      institutionId,
      moduleSlug: "yahrzeits",
      enabled: true,
    });
    const workspace = await owner.as.query(api.platform.getWorkspace, { slug: "beth-shalom" });
    expect(workspace?.modules.find((m) => m.slug === "yahrzeits")?.enabled).toBe(true);

    const audit = await owner.as.query(api.platform.listRecentAuditLogs, { institutionId });
    expect(
      audit.some((entry) => entry.entityType === "module" && entry.entityId === "yahrzeits"),
    ).toBe(true);
    expect(audit[0]?.actorEmail).toBe("founder@example.com");
  });

  test("institution updates require the admin role", async () => {
    const t = createBackend();
    const owner = await signUp(t, "founder@example.com");
    const institutionId = await createInstitutionAs(owner.as, "beth-shalom", "Beth Shalom");
    const staffer = await signUp(t, "staff@example.com");
    await owner.as.mutation(api.platform.addStaffByEmail, {
      institutionId,
      email: "staff@example.com",
      role: "staff",
    });

    await expect(
      staffer.as.mutation(api.platform.updateInstitution, { institutionId, name: "Renamed" }),
    ).rejects.toThrow(/admin/);
    await owner.as.mutation(api.platform.updateInstitution, {
      institutionId,
      name: "Renamed",
      timezone: "America/Chicago",
    });
    const workspace = await owner.as.query(api.platform.getWorkspace, { slug: "beth-shalom" });
    expect(workspace?.institution).toMatchObject({
      name: "Renamed",
      timezone: "America/Chicago",
    });
  });
});
