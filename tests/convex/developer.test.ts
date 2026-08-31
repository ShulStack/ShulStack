import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { type Backend, createBackend, createInstitutionAs, signUp } from "./helpers";

describe("API keys and the HTTP API", () => {
  let t: Backend;
  let owner: Awaited<ReturnType<typeof signUp>>;
  let institutionId: Id<"institutions">;

  beforeEach(async () => {
    vi.useFakeTimers();
    t = createBackend();
    owner = await signUp(t, "owner@example.com");
    institutionId = await createInstitutionAs(owner.as);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function createKey(name = "Test key"): Promise<string> {
    const created = await owner.as.mutation(api.developer.createApiKey, {
      institutionId,
      name,
    });
    return created.secret;
  }

  function get(path: string, secret?: string) {
    return t.fetch(path, {
      method: "GET",
      headers: secret === undefined ? {} : { Authorization: `Bearer ${secret}` },
    });
  }

  test("creates a key, returns the secret once, and stores only a hash", async () => {
    const created = await owner.as.mutation(api.developer.createApiKey, {
      institutionId,
      name: "Campaign dashboard",
    });
    expect(created.secret).toMatch(/^ssk_[0-9a-f]{48}$/);
    expect(created.keyPrefix).toBe(created.secret.slice(0, 12));

    const listed = await owner.as.query(api.developer.listApiKeys, { institutionId });
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      name: "Campaign dashboard",
      keyPrefix: created.keyPrefix,
      scopes: ["read"],
      createdByEmail: "owner@example.com",
    });
    expect(JSON.stringify(listed)).not.toContain(created.secret);

    const stored = await t.run(async (ctx) => await ctx.db.query("apiKeys").collect());
    expect(stored).toHaveLength(1);
    expect(stored[0]?.keyHash).not.toBe(created.secret);
    expect(stored[0]?.keyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("key management requires the admin role", async () => {
    const staffer = await signUp(t, "staff@example.com");
    await owner.as.mutation(api.platform.addStaffByEmail, {
      institutionId,
      email: "staff@example.com",
      role: "staff",
    });
    await expect(
      staffer.as.mutation(api.developer.createApiKey, { institutionId, name: "Nope" }),
    ).rejects.toThrow(/admin/);
    await expect(staffer.as.query(api.developer.listApiKeys, { institutionId })).rejects.toThrow(
      /admin/,
    );
  });

  test("requests without a valid key are rejected", async () => {
    const missing = await get("/api/v1/me");
    expect(missing.status).toBe(401);
    expect((await missing.json()).error.code).toBe("missing_api_key");

    const bogus = await get("/api/v1/me", "ssk_deadbeef");
    expect(bogus.status).toBe(401);
    expect((await bogus.json()).error.code).toBe("invalid_api_key");
  });

  test("/api/v1/me identifies the key and records use", async () => {
    const secret = await createKey("Introspection");
    const response = await get("/api/v1/me", secret);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual({
      keyName: "Introspection",
      institutionId,
      scopes: ["read"],
    });

    const [stored] = await t.run(async (ctx) => await ctx.db.query("apiKeys").collect());
    expect(stored?.lastUsedAt).toBeDefined();
  });

  test("revoked keys stop working immediately", async () => {
    const secret = await createKey();
    expect((await get("/api/v1/me", secret)).status).toBe(200);

    const listed = await owner.as.query(api.developer.listApiKeys, { institutionId });
    const keyId = listed[0]?.apiKeyId;
    if (keyId === undefined) throw new Error("unreachable");
    await owner.as.mutation(api.developer.revokeApiKey, { apiKeyId: keyId });

    expect((await get("/api/v1/me", secret)).status).toBe(401);
    await expect(
      owner.as.mutation(api.developer.revokeApiKey, { apiKeyId: keyId }),
    ).rejects.toThrow(/already revoked/);
  });

  test("data endpoints are scoped to the key's institution", async () => {
    const householdId = await owner.as.mutation(api.crm.createHousehold, {
      institutionId,
      displayName: "Cohen Family",
    });
    const secret = await createKey();

    const other = await signUp(t, "other@example.com");
    const otherInstitution = await createInstitutionAs(other.as, "other-shul", "Other Shul");
    const otherKey = await other.as.mutation(api.developer.createApiKey, {
      institutionId: otherInstitution,
      name: "Other key",
    });

    const mine = await (await get("/api/v1/households", secret)).json();
    expect(mine.data).toHaveLength(1);
    expect(mine.data[0]).toMatchObject({ id: householdId, displayName: "Cohen Family" });

    const theirs = await (await get("/api/v1/households", otherKey.secret)).json();
    expect(theirs.data).toHaveLength(0);

    // Another institution's ID answers exactly like a missing one.
    const crossTenant = await get(`/api/v1/households/${householdId}`, otherKey.secret);
    expect(crossTenant.status).toBe(404);
    const own = await get(`/api/v1/households/${householdId}`, secret);
    expect(own.status).toBe(200);
    const detail = await own.json();
    expect(detail.data.billingProfile).toBeDefined();
    expect(detail.data.members).toEqual([]);
  });

  test("transactions and ledgers paginate and filter by date", async () => {
    const householdId = await owner.as.mutation(api.crm.createHousehold, {
      institutionId,
      displayName: "Cohen Family",
    });
    for (const [occurredAt, amountMinor] of [
      ["2026-01-15", 100],
      ["2026-02-15", 200],
      ["2026-03-15", 300],
    ] as const) {
      await owner.as.mutation(api.ledger.addLedgerEntry, {
        householdId,
        entryType: "charge",
        amountMinor,
        occurredAt,
      });
    }
    const secret = await createKey();

    const firstPage = await (await get("/api/v1/transactions?limit=2", secret)).json();
    expect(firstPage.data.map((entry: { occurredAt: string }) => entry.occurredAt)).toEqual([
      "2026-03-15",
      "2026-02-15",
    ]);
    expect(firstPage.cursor).not.toBeNull();
    const secondPage = await (
      await get(
        `/api/v1/transactions?limit=2&cursor=${encodeURIComponent(firstPage.cursor)}`,
        secret,
      )
    ).json();
    expect(secondPage.data.map((entry: { occurredAt: string }) => entry.occurredAt)).toEqual([
      "2026-01-15",
    ]);
    expect(secondPage.cursor).toBeNull();

    const filtered = await (
      await get("/api/v1/transactions?from=2026-02-01&to=2026-02-28", secret)
    ).json();
    expect(filtered.data).toHaveLength(1);
    expect(filtered.data[0]).toMatchObject({
      occurredAt: "2026-02-15",
      amountMinor: 200,
      balanceDeltaMinor: 200,
    });

    const ledger = await (
      await get(`/api/v1/households/${householdId}/ledger?from=2026-03-01`, secret)
    ).json();
    expect(ledger.data).toHaveLength(1);
    expect(ledger.data[0]?.occurredAt).toBe("2026-03-15");

    const badDate = await get("/api/v1/transactions?from=March", secret);
    expect(badDate.status).toBe(400);
    const badLimit = await get("/api/v1/transactions?limit=9999", secret);
    expect(badLimit.status).toBe(400);
  });

  test("summary reports counts and balance totals", async () => {
    const householdId = await owner.as.mutation(api.crm.createHousehold, {
      institutionId,
      displayName: "Cohen Family",
    });
    await owner.as.mutation(api.ledger.addLedgerEntry, {
      householdId,
      entryType: "charge",
      amountMinor: 5_000,
      occurredAt: "2026-01-15",
    });
    await owner.as.mutation(api.crm.createPerson, { institutionId, firstName: "David" });
    const secret = await createKey();

    const summary = await (await get("/api/v1/summary", secret)).json();
    expect(summary.data).toMatchObject({
      activeHouseholds: 1,
      activePeople: 1,
      outstandingMinor: 5_000,
      creditMinor: 0,
    });
  });
});
