import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  type Backend,
  createBackend,
  createInstitutionAs,
  settleScheduled,
  signUp,
} from "./helpers";

describe("HTTP API write endpoints", () => {
  let t: Backend;
  let owner: Awaited<ReturnType<typeof signUp>>;
  let institutionId: Id<"institutions">;
  let writeKey: { secret: string; keyPrefix: string };
  let readKey: { secret: string; keyPrefix: string };

  beforeEach(async () => {
    vi.useFakeTimers();
    t = createBackend();
    owner = await signUp(t, "owner@example.com");
    institutionId = await createInstitutionAs(owner.as);
    writeKey = await owner.as.mutation(api.developer.createApiKey, {
      institutionId,
      name: "Writer",
      scopes: ["write"],
    });
    readKey = await owner.as.mutation(api.developer.createApiKey, {
      institutionId,
      name: "Reader",
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function request(method: string, path: string, secret: string, body?: unknown) {
    return t.fetch(path, {
      method,
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  function get(path: string, secret: string) {
    return t.fetch(path, { method: "GET", headers: { Authorization: `Bearer ${secret}` } });
  }

  /** Create a household through the API with the write key; returns its id. */
  async function createHousehold(displayName = "Cohen Family"): Promise<string> {
    const response = await request("POST", "/api/v1/households", writeKey.secret, { displayName });
    expect(response.status).toBe(201);
    return (await response.json()).data.id;
  }

  /** A second institution with its own write key, to prove tenant isolation. */
  async function createOtherInstitutionKey() {
    const other = await signUp(t, "other@example.com");
    const otherInstitution = await createInstitutionAs(other.as, "other-shul", "Other Shul");
    const key = await other.as.mutation(api.developer.createApiKey, {
      institutionId: otherInstitution,
      name: "Other writer",
      scopes: ["write"],
    });
    return { other, otherInstitution, secret: key.secret };
  }

  test("read-only keys get 403 insufficient_scope on every write endpoint", async () => {
    const householdId = await createHousehold();
    const attempts: [string, string][] = [
      ["POST", "/api/v1/households"],
      ["PATCH", `/api/v1/households/${householdId}`],
      ["POST", "/api/v1/people"],
      ["PATCH", "/api/v1/people/anything"],
      ["POST", `/api/v1/households/${householdId}/members`],
      ["POST", `/api/v1/households/${householdId}/ledger`],
    ];
    for (const [method, path] of attempts) {
      const response = await request(method, path, readKey.secret, { displayName: "Nope" });
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("insufficient_scope");
    }
    // The same read-only key still reads, and no key at all is a 401.
    expect((await get("/api/v1/households", readKey.secret)).status).toBe(200);
    const anonymous = await t.fetch("/api/v1/households", {
      method: "POST",
      body: JSON.stringify({ displayName: "Nope" }),
    });
    expect(anonymous.status).toBe(401);
  });

  test("POST /households creates, audits the key, and provisions billing via the domain event", async () => {
    const response = await request("POST", "/api/v1/households", writeKey.secret, {
      displayName: "  Cohen Family  ",
      householdType: "family",
      joinedAt: "2026-01-01",
    });
    expect(response.status).toBe(201);
    const created = (await response.json()).data;
    expect(created).toMatchObject({
      displayName: "Cohen Family",
      householdType: "family",
      joinedAt: "2026-01-01",
      isActive: true,
    });

    await settleScheduled(t);

    const detail = await (await get(`/api/v1/households/${created.id}`, readKey.secret)).json();
    expect(detail.data.billingProfile).toMatchObject({ balanceMinor: 0, currency: "USD" });

    const events = await t.run(async (ctx) => await ctx.db.query("domainEvents").collect());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ eventName: "household.created", status: "processed" });

    const audits = await t.run(async (ctx) => await ctx.db.query("auditLogs").collect());
    const householdAudit = audits.find((entry) => entry.entityType === "household");
    expect(householdAudit).toMatchObject({
      action: "create",
      after: { displayName: "Cohen Family", viaApiKey: writeKey.keyPrefix },
    });
    expect(householdAudit?.actorUserId).toBeUndefined();
  });

  test("POST /households rejects malformed bodies", async () => {
    const cases: unknown[] = [
      {},
      { displayName: "   " },
      { displayName: 42 },
      { displayName: "Levi Family", joinedAt: "01/15/2026" },
      { displayName: "Levi Family", bogusField: true },
    ];
    for (const body of cases) {
      const response = await request("POST", "/api/v1/households", writeKey.secret, body);
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("invalid_body");
    }
    const notJson = await t.fetch("/api/v1/households", {
      method: "POST",
      headers: { Authorization: `Bearer ${writeKey.secret}` },
      body: "definitely not json",
    });
    expect(notJson.status).toBe(400);
    const notObject = await request("POST", "/api/v1/households", writeKey.secret, [1, 2]);
    expect(notObject.status).toBe(400);
    expect(await t.run(async (ctx) => await ctx.db.query("households").collect())).toHaveLength(0);
  });

  test("PATCH /households updates fields and 404s on other institutions' ids", async () => {
    const householdId = await createHousehold();
    const response = await request("PATCH", `/api/v1/households/${householdId}`, writeKey.secret, {
      displayName: "Cohen-Levi Family",
      billingAccountType: "standard",
      resignedAt: "2026-06-30",
      isActive: false,
    });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({
      displayName: "Cohen-Levi Family",
      billingAccountType: "standard",
      resignedAt: "2026-06-30",
      isActive: false,
    });

    const events = await t.run(async (ctx) => await ctx.db.query("domainEvents").collect());
    expect(events.map((event) => event.eventName)).toContain("household.updated");

    const blank = await request("PATCH", `/api/v1/households/${householdId}`, writeKey.secret, {
      displayName: "   ",
    });
    expect(blank.status).toBe(400);
    expect((await blank.json()).error.code).toBe("invalid_body");

    const { secret: foreignSecret } = await createOtherInstitutionKey();
    const crossTenant = await request("PATCH", `/api/v1/households/${householdId}`, foreignSecret, {
      displayName: "Hijacked",
    });
    expect(crossTenant.status).toBe(404);
    const missing = await request("PATCH", "/api/v1/households/notanid", writeKey.secret, {
      displayName: "Ghost",
    });
    expect(missing.status).toBe(404);

    const detail = await (await get(`/api/v1/households/${householdId}`, readKey.secret)).json();
    expect(detail.data.displayName).toBe("Cohen-Levi Family");
  });

  test("POST and PATCH /people compute display names and stay tenant-scoped", async () => {
    const created = await request("POST", "/api/v1/people", writeKey.secret, {
      firstName: "David",
      lastName: "Cohen",
      gender: "male",
      dateOfBirth: "1980-05-01",
      hebrewGivenName: "David ben Avraham",
    });
    expect(created.status).toBe(201);
    const person = (await created.json()).data;
    expect(person).toMatchObject({
      displayName: "David Cohen",
      gender: "male",
      dateOfBirth: "1980-05-01",
      isActive: true,
      eligibleForAliyah: true,
      honoraryMember: false,
      isDeceased: false,
    });

    const patched = await request("PATCH", `/api/v1/people/${person.id}`, writeKey.secret, {
      nickname: "Dudu",
      honoraryMember: true,
      eligibleForAliyah: false,
    });
    expect(patched.status).toBe(200);
    expect((await patched.json()).data).toMatchObject({
      displayName: "Dudu Cohen",
      honoraryMember: true,
      eligibleForAliyah: false,
    });

    const fetched = await (await get(`/api/v1/people/${person.id}`, readKey.secret)).json();
    expect(fetched.data.displayName).toBe("Dudu Cohen");

    const audits = await t.run(async (ctx) => await ctx.db.query("auditLogs").collect());
    const personAudits = audits.filter((entry) => entry.entityType === "person");
    expect(personAudits).toHaveLength(2);
    for (const entry of personAudits) {
      expect(entry.actorUserId).toBeUndefined();
      expect(entry.after).toMatchObject({ viaApiKey: writeKey.keyPrefix });
    }

    const badGender = await request("POST", "/api/v1/people", writeKey.secret, {
      firstName: "X",
      gender: "unlisted",
    });
    expect(badGender.status).toBe(400);
    const badDate = await request("PATCH", `/api/v1/people/${person.id}`, writeKey.secret, {
      dateOfBirth: "1980-13-01",
    });
    expect(badDate.status).toBe(400);

    const { secret: foreignSecret } = await createOtherInstitutionKey();
    const crossTenant = await request("PATCH", `/api/v1/people/${person.id}`, foreignSecret, {
      firstName: "Hijacked",
    });
    expect(crossTenant.status).toBe(404);
    const after = await (await get(`/api/v1/people/${person.id}`, readKey.secret)).json();
    expect(after.data.displayName).toBe("Dudu Cohen");
  });

  test("POST /households/{id}/members links people and enforces the cross-institution guard", async () => {
    const householdId = await createHousehold();
    const personResponse = await request("POST", "/api/v1/people", writeKey.secret, {
      firstName: "Rivka",
      lastName: "Cohen",
    });
    const personId = (await personResponse.json()).data.id;

    const { other, otherInstitution } = await createOtherInstitutionKey();
    const foreignPersonId = await other.as.mutation(api.crm.createPerson, {
      institutionId: otherInstitution,
      firstName: "Foreign",
      lastName: "Person",
    });

    // A person from another institution answers exactly like a missing person.
    const rejected = await request(
      "POST",
      `/api/v1/households/${householdId}/members`,
      writeKey.secret,
      { personId: foreignPersonId },
    );
    expect(rejected.status).toBe(404);
    const unknown = await request(
      "POST",
      `/api/v1/households/${householdId}/members`,
      writeKey.secret,
      { personId: "notanid" },
    );
    expect(unknown.status).toBe(404);

    const added = await request(
      "POST",
      `/api/v1/households/${householdId}/members`,
      writeKey.secret,
      { personId, role: "head", isPrimaryContact: true },
    );
    expect(added.status).toBe(201);
    expect((await added.json()).data).toMatchObject({
      householdId,
      personId,
      role: "head",
      isPrimaryContact: true,
      isActive: true,
    });

    const detail = await (await get(`/api/v1/households/${householdId}`, readKey.secret)).json();
    expect(detail.data.members).toHaveLength(1);
    expect(detail.data.members[0]).toMatchObject({ personId, role: "head" });

    const events = await t.run(async (ctx) => await ctx.db.query("domainEvents").collect());
    expect(events.map((event) => event.eventName)).toContain("membership.changed");

    const memberships = await t.run(
      async (ctx) => await ctx.db.query("householdMembers").collect(),
    );
    expect(memberships).toHaveLength(1);

    const badRole = await request(
      "POST",
      `/api/v1/households/${householdId}/members`,
      writeKey.secret,
      { personId, role: "landlord" },
    );
    expect(badRole.status).toBe(400);
    const missingPerson = await request(
      "POST",
      `/api/v1/households/${householdId}/members`,
      writeKey.secret,
      { role: "head" },
    );
    expect(missingPerson.status).toBe(400);
  });

  test("POST /households/{id}/ledger moves the balance through recordLedgerEntry", async () => {
    const householdId = await createHousehold();
    await settleScheduled(t);

    const charge = await request(
      "POST",
      `/api/v1/households/${householdId}/ledger`,
      writeKey.secret,
      {
        entryType: "charge",
        amountMinor: 5_000,
        occurredAt: "2026-02-01",
        category: "dues",
        memo: "Annual dues",
      },
    );
    expect(charge.status).toBe(201);
    expect((await charge.json()).data).toMatchObject({
      entryType: "charge",
      amountMinor: 5_000,
      balanceDeltaMinor: 5_000,
      occurredAt: "2026-02-01",
      category: "dues",
    });

    const payment = await request(
      "POST",
      `/api/v1/households/${householdId}/ledger`,
      writeKey.secret,
      { entryType: "payment", amountMinor: 2_000, occurredAt: "2026-02-15", method: "check" },
    );
    expect(payment.status).toBe(201);

    const detail = await (await get(`/api/v1/households/${householdId}`, readKey.secret)).json();
    expect(detail.data.billingProfile).toMatchObject({
      balanceMinor: 3_000,
      balanceAsOf: "2026-02-15",
    });

    const ledger = await (
      await get(`/api/v1/households/${householdId}/ledger`, readKey.secret)
    ).json();
    expect(ledger.data.map((entry: { entryType: string }) => entry.entryType)).toEqual([
      "payment",
      "charge",
    ]);

    const events = await t.run(async (ctx) => await ctx.db.query("domainEvents").collect());
    const eventNames = events.map((event) => event.eventName);
    expect(eventNames).toContain("ledger.entry.recorded");
    expect(eventNames).toContain("payment.recorded");

    const audits = await t.run(async (ctx) => await ctx.db.query("auditLogs").collect());
    const ledgerAudits = audits.filter((entry) => entry.entityType === "ledgerEntry");
    expect(ledgerAudits).toHaveLength(2);
    for (const entry of ledgerAudits) {
      expect(entry.actorUserId).toBeUndefined();
      expect(entry.after).toMatchObject({ viaApiKey: writeKey.keyPrefix });
    }
  });

  test("POST /households/{id}/ledger rejects invalid entries and foreign households", async () => {
    const householdId = await createHousehold();
    await settleScheduled(t);

    const invalidBodies: unknown[] = [
      { entryType: "opening_balance", amountMinor: 100, occurredAt: "2026-02-01" },
      { entryType: "refund", amountMinor: 100, occurredAt: "2026-02-01" },
      { amountMinor: 100, occurredAt: "2026-02-01" },
      { entryType: "charge", amountMinor: 12.5, occurredAt: "2026-02-01" },
      { entryType: "charge", amountMinor: -100, occurredAt: "2026-02-01" },
      { entryType: "charge", amountMinor: "100", occurredAt: "2026-02-01" },
      { entryType: "charge", amountMinor: 100 },
      { entryType: "charge", amountMinor: 100, occurredAt: "2026-02-30" },
      { entryType: "charge", amountMinor: 100, occurredAt: "February 1" },
    ];
    for (const body of invalidBodies) {
      const response = await request(
        "POST",
        `/api/v1/households/${householdId}/ledger`,
        writeKey.secret,
        body,
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("invalid_body");
    }

    const { secret: foreignSecret } = await createOtherInstitutionKey();
    const crossTenant = await request(
      "POST",
      `/api/v1/households/${householdId}/ledger`,
      foreignSecret,
      { entryType: "charge", amountMinor: 100, occurredAt: "2026-02-01" },
    );
    expect(crossTenant.status).toBe(404);

    // Nothing above may have touched the ledger or the balance.
    expect(await t.run(async (ctx) => await ctx.db.query("ledgerEntries").collect())).toHaveLength(
      0,
    );
    const detail = await (await get(`/api/v1/households/${householdId}`, readKey.secret)).json();
    expect(detail.data.billingProfile.balanceMinor).toBe(0);
  });
});
