import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api } from "../../convex/_generated/api";
import { createBackend, createInstitutionAs, signUp } from "./helpers";

describe("site content", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("drafts are invisible to the public; published pages are public", async () => {
    const t = createBackend();
    const owner = await signUp(t, "owner@example.com");
    const institutionId = await createInstitutionAs(owner.as, "beth-demo", "Beth Demo");

    await owner.as.mutation(api.content.upsertPage, {
      institutionId,
      slug: "about",
      title: "About Us",
      status: "draft",
    });
    // Anonymous read of a draft: nothing.
    expect(
      await t.query(api.content.getPublishedPage, { institutionSlug: "beth-demo", slug: "about" }),
    ).toBeNull();

    await owner.as.mutation(api.content.upsertPage, {
      institutionId,
      slug: "about",
      title: "About Us",
      status: "published",
    });
    const page = await t.query(api.content.getPublishedPage, {
      institutionSlug: "beth-demo",
      slug: "about",
    });
    expect(page).toMatchObject({ slug: "about", title: "About Us", status: "published" });
  });

  test("pages are scoped per institution slug", async () => {
    const t = createBackend();
    const ownerA = await signUp(t, "a@example.com");
    const institutionA = await createInstitutionAs(ownerA.as, "shul-a", "Shul A");
    await ownerA.as.mutation(api.content.upsertPage, {
      institutionId: institutionA,
      slug: "about",
      title: "About Shul A",
      status: "published",
    });
    const ownerB = await signUp(t, "b@example.com");
    await createInstitutionAs(ownerB.as, "shul-b", "Shul B");

    expect(
      await t.query(api.content.getPublishedPage, { institutionSlug: "shul-b", slug: "about" }),
    ).toBeNull();
    expect(
      await t.query(api.content.getPublishedPage, { institutionSlug: "shul-a", slug: "about" }),
    ).not.toBeNull();
  });

  test("publishing is recorded as a publish audit action", async () => {
    const t = createBackend();
    const owner = await signUp(t, "owner@example.com");
    const institutionId = await createInstitutionAs(owner.as, "beth-demo", "Beth Demo");

    await owner.as.mutation(api.content.upsertPage, {
      institutionId,
      slug: "news",
      title: "News",
      status: "published",
    });
    const audit = await owner.as.query(api.platform.listRecentAuditLogs, { institutionId });
    expect(audit[0]).toMatchObject({ entityType: "page", entityId: "news", action: "publish" });
  });

  test("page slugs are validated server-side", async () => {
    const t = createBackend();
    const owner = await signUp(t, "owner@example.com");
    const institutionId = await createInstitutionAs(owner.as, "beth-demo", "Beth Demo");

    for (const slug of ["Bad Slug!", "", "UPPER", "a/../b"]) {
      await expect(
        owner.as.mutation(api.content.upsertPage, { institutionId, slug, title: "X" }),
      ).rejects.toThrow(/[Ss]lug/);
    }
  });

  test("an empty string clears optional page fields", async () => {
    const t = createBackend();
    const owner = await signUp(t, "owner@example.com");
    const institutionId = await createInstitutionAs(owner.as, "beth-demo", "Beth Demo");

    await owner.as.mutation(api.content.upsertPage, {
      institutionId,
      slug: "about",
      title: "About",
      summary: "A summary",
      status: "published",
    });
    await owner.as.mutation(api.content.upsertPage, {
      institutionId,
      slug: "about",
      title: "About",
      summary: "",
    });
    const page = await t.query(api.content.getPublishedPage, {
      institutionSlug: "beth-demo",
      slug: "about",
    });
    expect(page?.summary).toBeUndefined();
  });

  test("disabling the website module unpublishes the public site", async () => {
    const t = createBackend();
    const owner = await signUp(t, "owner@example.com");
    const institutionId = await createInstitutionAs(owner.as, "beth-demo", "Beth Demo");

    await owner.as.mutation(api.content.upsertPage, {
      institutionId,
      slug: "about",
      title: "About",
      status: "published",
    });
    await owner.as.mutation(api.platform.setModuleEnabled, {
      institutionId,
      moduleSlug: "cms",
      enabled: false,
    });
    expect(
      await t.query(api.content.getPublishedPage, { institutionSlug: "beth-demo", slug: "about" }),
    ).toBeNull();
    expect(
      await t.query(api.content.listPublishedPages, { institutionSlug: "beth-demo" }),
    ).toBeNull();
  });

  test("site settings are institution-scoped key/value documents", async () => {
    const t = createBackend();
    const owner = await signUp(t, "owner@example.com");
    const institutionId = await createInstitutionAs(owner.as, "beth-demo", "Beth Demo");

    await owner.as.mutation(api.content.setSiteSettings, {
      institutionId,
      value: { heroTitle: "Welcome" },
    });
    await owner.as.mutation(api.content.setSiteSettings, {
      institutionId,
      value: { heroTitle: "Shalom" },
    });
    const settings = await owner.as.query(api.content.getSiteSettings, { institutionId });
    expect(settings?.value).toEqual({ heroTitle: "Shalom" });
  });
});
