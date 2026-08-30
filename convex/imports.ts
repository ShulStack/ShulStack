import { buildPersonDisplayName } from "@shulstack/platform";
import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation } from "./_generated/server";
import { recordLedgerEntry } from "./ledger";
import { requireStaff } from "./lib/access";
import { logAudit } from "./lib/audit";
import { emitDomainEvent } from "./lib/domainEvents";
import { genderValidator, householdMemberRoleValidator } from "./lib/validators";

/**
 * ShulCloud import: rows are parsed and mapped client-side by
 * @shulstack/platform (pure and unit-tested); these mutations apply them
 * idempotently. Identity is anchored in externalReferences
 * (system "shulcloud"), so re-running an import updates instead of
 * duplicating. Contact rows created by the importer are tagged with
 * metadata.source and replaced wholesale on re-import.
 */

const SYSTEM = "shulcloud";
const IMPORT_SOURCE = { source: SYSTEM };

// The web importer sends 50-row chunks; the cap keeps direct API calls from
// blowing Convex's per-mutation limits with a whole CSV in one batch.
const MAX_IMPORT_ROWS = 100;

function assertBatchSize(rows: number): void {
  if (rows > MAX_IMPORT_ROWS) {
    throw new ConvexError(
      `Import batches are limited to ${MAX_IMPORT_ROWS} rows; send smaller chunks.`,
    );
  }
}

const importedAccountValidator = v.object({
  externalId: v.string(),
  displayName: v.string(),
  householdType: v.optional(v.string()),
  billingAccountType: v.optional(v.string()),
  mailLabel: v.optional(v.string()),
  billingMailLabel: v.optional(v.string()),
  addedAt: v.optional(v.string()),
  joinedAt: v.optional(v.string()),
  resignedAt: v.optional(v.string()),
  isActive: v.boolean(),
  openingBalanceMinor: v.optional(v.number()),
  address: v.optional(
    v.object({
      address1: v.optional(v.string()),
      address2: v.optional(v.string()),
      city: v.optional(v.string()),
      state: v.optional(v.string()),
      postalCode: v.optional(v.string()),
      country: v.optional(v.string()),
    }),
  ),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  metadata: v.record(v.string(), v.string()),
});

const importedPersonValidator = v.object({
  externalId: v.string(),
  accountExternalId: v.optional(v.string()),
  title: v.optional(v.string()),
  firstName: v.optional(v.string()),
  middleName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  nickname: v.optional(v.string()),
  suffix: v.optional(v.string()),
  mailName: v.optional(v.string()),
  personType: v.optional(v.string()),
  gender: genderValidator,
  maritalStatus: v.optional(v.string()),
  maidenName: v.optional(v.string()),
  hebrewGivenName: v.optional(v.string()),
  hebrewFatherName: v.optional(v.string()),
  hebrewMotherName: v.optional(v.string()),
  hebrewFamilyName: v.optional(v.string()),
  dateOfBirth: v.optional(v.string()),
  hebrewBirthDate: v.optional(v.string()),
  honoraryMember: v.boolean(),
  eligibleForAliyah: v.boolean(),
  isDeceased: v.boolean(),
  isActive: v.boolean(),
  memberRole: householdMemberRoleValidator,
  sourceRoleLabel: v.optional(v.string()),
  isPrimaryContact: v.boolean(),
  memberJoinedAt: v.optional(v.string()),
  memberResignedAt: v.optional(v.string()),
  emails: v.array(v.string()),
  phones: v.array(
    v.object({
      label: v.union(
        v.literal("home"),
        v.literal("mobile"),
        v.literal("work"),
        v.literal("fax"),
        v.literal("other"),
      ),
      value: v.string(),
    }),
  ),
  metadata: v.record(v.string(), v.string()),
});

async function findExternalRef(
  ctx: MutationCtx,
  institutionId: Id<"institutions">,
  referenceType: string,
  value: string,
): Promise<Doc<"externalReferences"> | null> {
  // .first() rather than .unique(): a duplicate reference row (from a crash
  // mid-import) should degrade to "pick one", not poison every future import.
  return await ctx.db
    .query("externalReferences")
    .withIndex("by_external_value", (q) =>
      q
        .eq("institutionId", institutionId)
        .eq("system", SYSTEM)
        .eq("referenceType", referenceType)
        .eq("value", value),
    )
    .first();
}

function todayIso(): string {
  return new Date(Date.now()).toISOString().slice(0, 10);
}

export const importAccounts = mutation({
  args: {
    institutionId: v.id("institutions"),
    accounts: v.array(importedAccountValidator),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireStaff(ctx, args.institutionId, "admin");
    assertBatchSize(args.accounts.length);
    let created = 0;
    let updated = 0;

    for (const account of args.accounts) {
      const now = Date.now();
      const fields = {
        displayName: account.displayName,
        householdType: account.householdType,
        billingAccountType: account.billingAccountType,
        mailLabel: account.mailLabel,
        billingMailLabel: account.billingMailLabel,
        addedAt: account.addedAt,
        joinedAt: account.joinedAt,
        resignedAt: account.resignedAt,
        isActive: account.isActive,
      };

      const ref = await findExternalRef(ctx, args.institutionId, "account", account.externalId);
      let household: Doc<"households"> | null = null;
      if (ref !== null) {
        const householdId = ctx.db.normalizeId("households", ref.entityId);
        household = householdId === null ? null : await ctx.db.get(householdId);
        if (household !== null && household.institutionId !== args.institutionId) {
          household = null; // Never write across institutions, even via a bad ref.
        }
      }

      if (household !== null) {
        await ctx.db.patch(household._id, {
          ...fields,
          metadata: { ...household.metadata, [SYSTEM]: account.metadata },
          updatedAt: now,
        });
        await replaceHouseholdContacts(ctx, household._id, args.institutionId, account);
        updated += 1;
      } else {
        const householdId = await ctx.db.insert("households", {
          institutionId: args.institutionId,
          ...fields,
          metadata: { [SYSTEM]: account.metadata },
          updatedAt: now,
        });
        await ctx.db.insert("externalReferences", {
          institutionId: args.institutionId,
          system: SYSTEM,
          referenceType: "account",
          entityType: "household",
          entityId: householdId,
          value: account.externalId,
          metadata: {},
          updatedAt: now,
        });
        await replaceHouseholdContacts(ctx, householdId, args.institutionId, account);
        if (account.openingBalanceMinor !== undefined && account.openingBalanceMinor !== 0) {
          const inserted = await ctx.db.get(householdId);
          if (inserted !== null) {
            await recordLedgerEntry(ctx, inserted, {
              entryType: "opening_balance",
              amountMinor: account.openingBalanceMinor,
              occurredAt: todayIso(),
              memo: "Imported from ShulCloud",
              metadata: IMPORT_SOURCE,
            });
          }
        }
        await emitDomainEvent(ctx, {
          institutionId: args.institutionId,
          eventName: "household.created",
          payload: { householdId },
        });
        created += 1;
      }
    }

    await logAudit(ctx, {
      institutionId: args.institutionId,
      actorUserId: userId,
      entityType: "import",
      entityId: `${SYSTEM}:accounts`,
      action: "create",
      after: { created, updated, total: args.accounts.length },
    });
    return { created, updated };
  },
});

export const importPeople = mutation({
  args: {
    institutionId: v.id("institutions"),
    people: v.array(importedPersonValidator),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireStaff(ctx, args.institutionId, "admin");
    assertBatchSize(args.people.length);
    let created = 0;
    let updated = 0;
    const warnings: string[] = [];

    for (const imported of args.people) {
      const now = Date.now();

      // Resolve the household link first so a bad account id is reported
      // but never blocks the person record itself.
      let household: Doc<"households"> | null = null;
      if (imported.accountExternalId !== undefined) {
        const accountRef = await findExternalRef(
          ctx,
          args.institutionId,
          "account",
          imported.accountExternalId,
        );
        const householdId =
          accountRef === null ? null : ctx.db.normalizeId("households", accountRef.entityId);
        household = householdId === null ? null : await ctx.db.get(householdId);
        if (household !== null && household.institutionId !== args.institutionId) {
          household = null;
        }
        if (household === null && warnings.length < 50) {
          warnings.push(
            `Person ${imported.externalId}: account ${imported.accountExternalId} not imported yet`,
          );
        }
      }

      const fields = {
        displayName: buildPersonDisplayName(imported),
        title: imported.title,
        firstName: imported.firstName,
        middleName: imported.middleName,
        lastName: imported.lastName,
        nickname: imported.nickname,
        suffix: imported.suffix,
        mailName: imported.mailName,
        personType: imported.personType,
        gender: imported.gender,
        maritalStatus: imported.maritalStatus,
        maidenName: imported.maidenName,
        hebrewGivenName: imported.hebrewGivenName,
        hebrewFatherName: imported.hebrewFatherName,
        hebrewMotherName: imported.hebrewMotherName,
        hebrewFamilyName: imported.hebrewFamilyName,
        dateOfBirth: imported.dateOfBirth,
        hebrewBirthDate: imported.hebrewBirthDate,
        honoraryMember: imported.honoraryMember,
        eligibleForAliyah: imported.eligibleForAliyah,
        isDeceased: imported.isDeceased,
        isActive: imported.isActive,
      };

      const ref = await findExternalRef(ctx, args.institutionId, "person", imported.externalId);
      let person: Doc<"people"> | null = null;
      if (ref !== null) {
        const personId = ctx.db.normalizeId("people", ref.entityId);
        person = personId === null ? null : await ctx.db.get(personId);
        if (person !== null && person.institutionId !== args.institutionId) {
          person = null;
        }
      }

      let personId: Id<"people">;
      if (person !== null) {
        personId = person._id;
        await ctx.db.patch(personId, {
          ...fields,
          metadata: { ...person.metadata, [SYSTEM]: imported.metadata },
          updatedAt: now,
        });
        updated += 1;
      } else {
        personId = await ctx.db.insert("people", {
          institutionId: args.institutionId,
          ...fields,
          metadata: { [SYSTEM]: imported.metadata },
          updatedAt: now,
        });
        await ctx.db.insert("externalReferences", {
          institutionId: args.institutionId,
          system: SYSTEM,
          referenceType: "person",
          entityType: "person",
          entityId: personId,
          value: imported.externalId,
          metadata: {},
          updatedAt: now,
        });
        created += 1;
      }
      await replacePersonContacts(ctx, personId, args.institutionId, imported);

      if (household !== null) {
        await upsertImportedMembership(ctx, household, personId, imported, now);
      }
    }

    await logAudit(ctx, {
      institutionId: args.institutionId,
      actorUserId: userId,
      entityType: "import",
      entityId: `${SYSTEM}:people`,
      action: "create",
      after: { created, updated, total: args.people.length, warnings: warnings.length },
    });
    return { created, updated, warnings };
  },
});

type ImportedAccountShape = {
  address?: {
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  email?: string;
  phone?: string;
};

async function replaceHouseholdContacts(
  ctx: MutationCtx,
  householdId: Id<"households">,
  institutionId: Id<"institutions">,
  account: ImportedAccountShape,
): Promise<void> {
  const now = Date.now();
  const addresses = await ctx.db
    .query("householdAddresses")
    .withIndex("by_household", (q) => q.eq("householdId", householdId))
    .collect();
  for (const address of addresses) {
    if (address.metadata.source === SYSTEM) {
      await ctx.db.delete(address._id);
    }
  }
  if (account.address !== undefined) {
    await ctx.db.insert("householdAddresses", {
      institutionId,
      householdId,
      addressType: "home",
      ...account.address,
      isPrimary: true,
      metadata: IMPORT_SOURCE,
      updatedAt: now,
    });
  }

  const contactPoints = await ctx.db
    .query("householdContactPoints")
    .withIndex("by_household", (q) => q.eq("householdId", householdId))
    .collect();
  for (const contactPoint of contactPoints) {
    if (contactPoint.metadata.source === SYSTEM) {
      await ctx.db.delete(contactPoint._id);
    }
  }
  if (account.email !== undefined) {
    await ctx.db.insert("householdContactPoints", {
      institutionId,
      householdId,
      type: "email",
      label: "home",
      value: account.email,
      normalizedValue: account.email.trim().toLowerCase(),
      isPrimary: true,
      metadata: IMPORT_SOURCE,
      updatedAt: now,
    });
  }
  if (account.phone !== undefined) {
    await ctx.db.insert("householdContactPoints", {
      institutionId,
      householdId,
      type: "phone",
      label: "home",
      value: account.phone,
      isPrimary: true,
      metadata: IMPORT_SOURCE,
      updatedAt: now,
    });
  }
}

type ImportedPersonContacts = {
  emails: string[];
  phones: Array<{ label: "home" | "mobile" | "work" | "fax" | "other"; value: string }>;
};

async function replacePersonContacts(
  ctx: MutationCtx,
  personId: Id<"people">,
  institutionId: Id<"institutions">,
  imported: ImportedPersonContacts,
): Promise<void> {
  const now = Date.now();
  const existing = await ctx.db
    .query("personContactPoints")
    .withIndex("by_person", (q) => q.eq("personId", personId))
    .collect();
  for (const contactPoint of existing) {
    if (contactPoint.metadata.source === SYSTEM) {
      await ctx.db.delete(contactPoint._id);
    }
  }
  let isFirstEmail = true;
  for (const email of imported.emails) {
    await ctx.db.insert("personContactPoints", {
      institutionId,
      personId,
      type: "email",
      label: "home",
      value: email,
      normalizedValue: email.trim().toLowerCase(),
      isPrimary: isFirstEmail,
      metadata: IMPORT_SOURCE,
      updatedAt: now,
    });
    isFirstEmail = false;
  }
  let isFirstPhone = true;
  for (const phone of imported.phones) {
    await ctx.db.insert("personContactPoints", {
      institutionId,
      personId,
      type: "phone",
      label: phone.label,
      value: phone.value,
      isPrimary: isFirstPhone,
      metadata: IMPORT_SOURCE,
      updatedAt: now,
    });
    isFirstPhone = false;
  }
}

type ImportedMembershipShape = {
  memberRole: "head" | "spouse" | "child" | "dependent_adult" | "other";
  sourceRoleLabel?: string;
  isPrimaryContact: boolean;
  isActive: boolean;
  memberJoinedAt?: string;
  memberResignedAt?: string;
};

async function upsertImportedMembership(
  ctx: MutationCtx,
  household: Doc<"households">,
  personId: Id<"people">,
  imported: ImportedMembershipShape,
  now: number,
): Promise<void> {
  const existing = await ctx.db
    .query("householdMembers")
    .withIndex("by_household_person", (q) =>
      q.eq("householdId", household._id).eq("personId", personId),
    )
    .unique();
  const fields = {
    role: imported.memberRole,
    sourceRoleLabel: imported.sourceRoleLabel,
    isPrimaryContact: imported.isPrimaryContact,
    isBillingContact: imported.isPrimaryContact,
    isMailRecipient: imported.isPrimaryContact,
    isActive: imported.isActive,
    joinedAt: imported.memberJoinedAt,
    resignedAt: imported.memberResignedAt,
    updatedAt: now,
  };
  if (existing !== null) {
    await ctx.db.patch(existing._id, fields);
  } else {
    await ctx.db.insert("householdMembers", {
      institutionId: household.institutionId,
      householdId: household._id,
      personId,
      ...fields,
      sortOrder: 0,
      metadata: IMPORT_SOURCE,
    });
  }
}
