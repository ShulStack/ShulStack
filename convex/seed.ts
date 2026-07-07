import { buildPersonDisplayName } from "@shulstack/platform";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation } from "./_generated/server";
import { requireStaff } from "./lib/access";
import { logAudit } from "./lib/audit";
import { emitDomainEvent } from "./lib/domainEvents";

type SamplePerson = {
  firstName: string;
  lastName: string;
  gender: "male" | "female" | "nonbinary" | "unknown";
  role: "head" | "spouse" | "child";
  hebrewGivenName?: string;
};

type SampleHousehold = {
  displayName: string;
  householdType: string;
  joinedAt: string;
  balanceMinor: number;
  people: SamplePerson[];
};

const SAMPLE_HOUSEHOLDS: SampleHousehold[] = [
  {
    displayName: "Cohen Family",
    householdType: "family",
    joinedAt: "2019-09-15",
    balanceMinor: 42_500,
    people: [
      {
        firstName: "David",
        lastName: "Cohen",
        gender: "male",
        role: "head",
        hebrewGivenName: "דוד",
      },
      {
        firstName: "Rachel",
        lastName: "Cohen",
        gender: "female",
        role: "spouse",
        hebrewGivenName: "רחל",
      },
      { firstName: "Noa", lastName: "Cohen", gender: "female", role: "child" },
      { firstName: "Eitan", lastName: "Cohen", gender: "male", role: "child" },
    ],
  },
  {
    displayName: "Levi-Marcus Household",
    householdType: "family",
    joinedAt: "2021-01-08",
    balanceMinor: 0,
    people: [
      {
        firstName: "Sarah",
        lastName: "Levi",
        gender: "female",
        role: "head",
        hebrewGivenName: "שרה",
      },
      { firstName: "Jonathan", lastName: "Marcus", gender: "male", role: "spouse" },
    ],
  },
  {
    displayName: "Goldberg, Miriam",
    householdType: "individual",
    joinedAt: "2015-06-22",
    balanceMinor: -1_800,
    people: [
      {
        firstName: "Miriam",
        lastName: "Goldberg",
        gender: "female",
        role: "head",
        hebrewGivenName: "מרים",
      },
    ],
  },
];

/**
 * Load a small, realistic sample dataset into an empty institution so a fresh
 * deployment is explorable in one click. Admin-only, and refuses to run once
 * the institution has any households.
 */
export const loadSampleData = mutation({
  args: { institutionId: v.id("institutions") },
  handler: async (ctx, args) => {
    const { userId } = await requireStaff(ctx, args.institutionId, "admin");
    const anyHousehold = await ctx.db
      .query("households")
      .withIndex("by_institution", (q) => q.eq("institutionId", args.institutionId))
      .first();
    if (anyHousehold !== null) {
      throw new ConvexError("Sample data can only be loaded into an empty institution.");
    }

    const now = Date.now();
    for (const sample of SAMPLE_HOUSEHOLDS) {
      const householdId = await createSampleHousehold(ctx, args.institutionId, sample, now);
      await emitDomainEvent(ctx, {
        institutionId: args.institutionId,
        eventName: "household.created",
        payload: { householdId },
      });
    }

    await ctx.db.insert("pages", {
      institutionId: args.institutionId,
      slug: "welcome",
      title: "Welcome to Our Community",
      summary: "A sample published page created by the demo seed.",
      layout: [
        {
          type: "markdown",
          body: "## Welcome\n\nThis page was created by the ShulStack sample dataset. Edit or archive it from the dashboard.",
        },
      ],
      status: "published",
      updatedAt: now,
    });

    await logAudit(ctx, {
      institutionId: args.institutionId,
      actorUserId: userId,
      entityType: "institution",
      entityId: args.institutionId,
      action: "update",
      after: { sampleData: true },
    });
  },
});

async function createSampleHousehold(
  ctx: MutationCtx,
  institutionId: Id<"institutions">,
  sample: SampleHousehold,
  now: number,
): Promise<Id<"households">> {
  const householdId = await ctx.db.insert("households", {
    institutionId,
    displayName: sample.displayName,
    householdType: sample.householdType,
    joinedAt: sample.joinedAt,
    isActive: true,
    metadata: { sample: true },
    updatedAt: now,
  });

  let isFirst = true;
  for (const samplePerson of sample.people) {
    const personId = await ctx.db.insert("people", {
      institutionId,
      displayName: buildPersonDisplayName(samplePerson),
      firstName: samplePerson.firstName,
      lastName: samplePerson.lastName,
      gender: samplePerson.gender,
      hebrewGivenName: samplePerson.hebrewGivenName,
      honoraryMember: false,
      eligibleForAliyah: true,
      isDeceased: false,
      isActive: true,
      metadata: { sample: true },
      updatedAt: now,
    });
    await ctx.db.insert("householdMembers", {
      institutionId,
      householdId,
      personId,
      role: samplePerson.role,
      isPrimaryContact: isFirst,
      isBillingContact: isFirst,
      isMailRecipient: isFirst,
      isActive: true,
      sortOrder: 0,
      metadata: {},
      updatedAt: now,
    });
    isFirst = false;
  }

  await ctx.db.insert("householdBillingProfiles", {
    institutionId,
    householdId,
    balanceMinor: sample.balanceMinor,
    balanceAsOf: "2026-07-01",
    currency: "USD",
    metadata: { sample: true },
    updatedAt: now,
  });
  return householdId;
}
