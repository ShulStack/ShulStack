import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import {
  addressTypeValidator,
  affiliationTypeValidator,
  auditActionValidator,
  campaignStatusValidator,
  contactPointLabelValidator,
  contactPointTypeValidator,
  domainEventStatusValidator,
  genderValidator,
  householdMemberRoleValidator,
  ledgerEntryTypeValidator,
  lifecycleEventTypeValidator,
  metadataValidator,
  moduleSlugValidator,
  optionalIsoDate,
  pageStatusValidator,
  pledgeStageValidator,
  staffRoleValidator,
} from "./lib/validators";

const optionalText = v.optional(v.string());

// Timestamps: Convex stores `_creationTime` on every document, so tables only
// carry `updatedAt` (epoch millis) when rows are mutable.
export default defineSchema({
  ...authTables,

  // --- Platform ------------------------------------------------------------

  institutions: defineTable({
    slug: v.string(),
    name: v.string(),
    timezone: v.string(),
    branding: metadataValidator,
    settings: metadataValidator,
    updatedAt: v.number(),
  }).index("by_slug", ["slug"]),

  // Links an authenticated user to an institution with a staff role. This is
  // the authorization backbone: every staff-facing function resolves one of
  // these rows before touching institution data.
  staffMembers: defineTable({
    institutionId: v.id("institutions"),
    userId: v.id("users"),
    role: staffRoleValidator,
    isActive: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_institution", ["institutionId"])
    .index("by_user", ["userId"])
    .index("by_institution_user", ["institutionId", "userId"]),

  // Links an authenticated user to the CRM person they are, for the member
  // portal. Kept separate from staffMembers: being staff and being a member
  // are independent facts.
  personUserLinks: defineTable({
    institutionId: v.id("institutions"),
    userId: v.id("users"),
    personId: v.id("people"),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_person", ["personId"])
    .index("by_institution_user", ["institutionId", "userId"]),

  moduleEnablement: defineTable({
    institutionId: v.id("institutions"),
    moduleSlug: moduleSlugValidator,
    enabled: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_institution", ["institutionId"])
    .index("by_institution_module", ["institutionId", "moduleSlug"]),

  auditLogs: defineTable({
    institutionId: v.id("institutions"),
    actorUserId: v.optional(v.id("users")),
    entityType: v.string(),
    entityId: v.string(),
    action: auditActionValidator,
    before: v.optional(metadataValidator),
    after: v.optional(metadataValidator),
  })
    .index("by_institution", ["institutionId"])
    .index("by_entity", ["entityType", "entityId"]),

  // Programmatic access to one institution's data over the HTTP API (and the
  // MCP server that will ride on it). The secret is never stored: only its
  // SHA-256 hash plus a short display prefix. Revocation is permanent.
  apiKeys: defineTable({
    institutionId: v.id("institutions"),
    name: v.string(),
    keyPrefix: v.string(),
    keyHash: v.string(),
    scopes: v.array(v.literal("read")),
    createdBy: v.id("users"),
    lastUsedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_institution", ["institutionId"])
    .index("by_hash", ["keyHash"]),

  domainEvents: defineTable({
    institutionId: v.id("institutions"),
    eventName: v.string(),
    payload: metadataValidator,
    status: domainEventStatusValidator,
    attempts: v.number(),
    error: optionalText,
    processedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_institution_status", ["institutionId", "status"]),

  // --- CRM -----------------------------------------------------------------

  households: defineTable({
    institutionId: v.id("institutions"),
    displayName: v.string(),
    householdType: optionalText,
    billingAccountType: optionalText,
    mailLabel: optionalText,
    billingMailLabel: optionalText,
    addedAt: optionalIsoDate,
    joinedAt: optionalIsoDate,
    resignedAt: optionalIsoDate,
    isActive: v.boolean(),
    metadata: metadataValidator,
    updatedAt: v.number(),
  })
    .index("by_institution", ["institutionId"])
    .index("by_institution_active", ["institutionId", "isActive"])
    .searchIndex("search_display_name", {
      searchField: "displayName",
      filterFields: ["institutionId"],
    }),

  people: defineTable({
    institutionId: v.id("institutions"),
    // Derived from name parts on every write; gives lists and search one
    // canonical rendering of a person.
    displayName: v.string(),
    title: optionalText,
    firstName: optionalText,
    middleName: optionalText,
    lastName: optionalText,
    nickname: optionalText,
    suffix: optionalText,
    mailName: optionalText,
    personType: optionalText,
    gender: genderValidator,
    maritalStatus: optionalText,
    maidenName: optionalText,
    tribe: optionalText,
    countryOfBirth: optionalText,
    hebrewGivenName: optionalText,
    hebrewFatherName: optionalText,
    hebrewMotherName: optionalText,
    hebrewFamilyName: optionalText,
    dateOfBirth: optionalIsoDate,
    hebrewBirthDate: optionalText,
    honoraryMember: v.boolean(),
    eligibleForAliyah: v.boolean(),
    isDeceased: v.boolean(),
    isActive: v.boolean(),
    metadata: metadataValidator,
    updatedAt: v.number(),
  })
    .index("by_institution", ["institutionId"])
    .index("by_institution_active", ["institutionId", "isActive"])
    .index("by_institution_last_name", ["institutionId", "lastName"])
    .searchIndex("search_display_name", {
      searchField: "displayName",
      filterFields: ["institutionId"],
    }),

  householdMembers: defineTable({
    institutionId: v.id("institutions"),
    householdId: v.id("households"),
    personId: v.id("people"),
    role: householdMemberRoleValidator,
    sourceRoleLabel: optionalText,
    isPrimaryContact: v.boolean(),
    isBillingContact: v.boolean(),
    isMailRecipient: v.boolean(),
    isActive: v.boolean(),
    joinedAt: optionalIsoDate,
    resignedAt: optionalIsoDate,
    sortOrder: v.number(),
    metadata: metadataValidator,
    updatedAt: v.number(),
  })
    .index("by_household", ["householdId"])
    .index("by_person", ["personId"])
    .index("by_household_person", ["householdId", "personId"]),

  householdAddresses: defineTable({
    institutionId: v.id("institutions"),
    householdId: v.id("households"),
    addressType: addressTypeValidator,
    recipientLabel: optionalText,
    address1: optionalText,
    address2: optionalText,
    city: optionalText,
    state: optionalText,
    postalCode: optionalText,
    country: optionalText,
    isPrimary: v.boolean(),
    metadata: metadataValidator,
    updatedAt: v.number(),
  }).index("by_household", ["householdId"]),

  personAddresses: defineTable({
    institutionId: v.id("institutions"),
    personId: v.id("people"),
    addressType: addressTypeValidator,
    recipientLabel: optionalText,
    address1: optionalText,
    address2: optionalText,
    city: optionalText,
    state: optionalText,
    postalCode: optionalText,
    country: optionalText,
    isPrimary: v.boolean(),
    metadata: metadataValidator,
    updatedAt: v.number(),
  }).index("by_person", ["personId"]),

  householdContactPoints: defineTable({
    institutionId: v.id("institutions"),
    householdId: v.id("households"),
    type: contactPointTypeValidator,
    label: contactPointLabelValidator,
    value: v.string(),
    normalizedValue: optionalText,
    isPrimary: v.boolean(),
    metadata: metadataValidator,
    updatedAt: v.number(),
  }).index("by_household", ["householdId"]),

  personContactPoints: defineTable({
    institutionId: v.id("institutions"),
    personId: v.id("people"),
    type: contactPointTypeValidator,
    label: contactPointLabelValidator,
    value: v.string(),
    normalizedValue: optionalText,
    isPrimary: v.boolean(),
    metadata: metadataValidator,
    updatedAt: v.number(),
  }).index("by_person", ["personId"]),

  personAffiliations: defineTable({
    institutionId: v.id("institutions"),
    personId: v.id("people"),
    affiliationType: affiliationTypeValidator,
    organizationName: optionalText,
    title: optionalText,
    level: optionalText,
    category: optionalText,
    email: optionalText,
    phone: optionalText,
    alternatePhone: optionalText,
    fax: optionalText,
    address1: optionalText,
    address2: optionalText,
    city: optionalText,
    state: optionalText,
    postalCode: optionalText,
    country: optionalText,
    isPrimary: v.boolean(),
    metadata: metadataValidator,
    updatedAt: v.number(),
  }).index("by_person", ["personId"]),

  personLifecycleEvents: defineTable({
    institutionId: v.id("institutions"),
    personId: v.id("people"),
    eventType: lifecycleEventTypeValidator,
    occurredAt: optionalIsoDate,
    occurredAtHebrew: optionalText,
    nextObservedAt: optionalIsoDate,
    location: optionalText,
    details: optionalText,
    metadata: metadataValidator,
    updatedAt: v.number(),
  }).index("by_person", ["personId"]),

  tags: defineTable({
    institutionId: v.id("institutions"),
    name: v.string(),
    slug: v.string(),
    category: optionalText,
    description: optionalText,
    metadata: metadataValidator,
    updatedAt: v.number(),
  })
    .index("by_institution", ["institutionId"])
    .index("by_institution_slug", ["institutionId", "slug"]),

  tagAssignments: defineTable({
    institutionId: v.id("institutions"),
    tagId: v.id("tags"),
    entityType: v.string(),
    entityId: v.string(),
    metadata: metadataValidator,
  })
    .index("by_tag", ["tagId"])
    .index("by_entity", ["entityType", "entityId"])
    .index("by_entity_tag", ["entityType", "entityId", "tagId"]),

  externalReferences: defineTable({
    institutionId: v.id("institutions"),
    system: v.string(),
    referenceType: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    value: v.string(),
    metadata: metadataValidator,
    updatedAt: v.number(),
  }).index("by_external_value", ["institutionId", "system", "referenceType", "value"]),

  // --- Finance ---------------------------------------------------------------

  householdBillingProfiles: defineTable({
    institutionId: v.id("institutions"),
    householdId: v.id("households"),
    deliveryMethod: optionalText,
    discountNotes: optionalText,
    // Money is stored in integer minor units (cents for USD). Never floats,
    // never strings.
    balanceMinor: v.number(),
    balanceAsOf: optionalIsoDate,
    currency: v.string(),
    metadata: metadataValidator,
    updatedAt: v.number(),
  })
    .index("by_household", ["householdId"])
    .index("by_institution", ["institutionId"]),

  householdBalanceSnapshots: defineTable({
    institutionId: v.id("institutions"),
    billingProfileId: v.id("householdBillingProfiles"),
    asOfDate: v.string(),
    balanceMinor: v.number(),
    metadata: metadataValidator,
  }).index("by_profile_date", ["billingProfileId", "asOfDate"]),

  // Immutable financial ledger. Balances on billing profiles are maintained
  // atomically by the mutations that insert these rows; corrections are new
  // credit/charge entries, never edits.
  ledgerEntries: defineTable({
    institutionId: v.id("institutions"),
    householdId: v.id("households"),
    entryType: ledgerEntryTypeValidator,
    // Positive for charge/payment/credit (sign comes from the type);
    // opening_balance carries a signed amount.
    amountMinor: v.number(),
    occurredAt: v.string(),
    category: optionalText,
    method: optionalText,
    memo: optionalText,
    createdBy: v.optional(v.id("users")),
    metadata: metadataValidator,
  })
    .index("by_household_date", ["householdId", "occurredAt"])
    .index("by_institution_date", ["institutionId", "occurredAt"]),

  // --- Fundraising -----------------------------------------------------------

  campaigns: defineTable({
    institutionId: v.id("institutions"),
    name: v.string(),
    description: optionalText,
    goalMinor: v.optional(v.number()),
    startDate: optionalIsoDate,
    endDate: optionalIsoDate,
    status: campaignStatusValidator,
    updatedAt: v.number(),
  }).index("by_institution", ["institutionId"]),

  // A pledge is a relationship being worked through the pipeline, tied to the
  // household (the billing unit) with optional attribution to the person.
  // `paidMinor` is maintained only by fundraising.recordPledgePayment, which
  // also writes the money itself onto the household ledger.
  pledges: defineTable({
    institutionId: v.id("institutions"),
    campaignId: v.id("campaigns"),
    householdId: v.id("households"),
    personId: v.optional(v.id("people")),
    amountMinor: v.number(),
    paidMinor: v.number(),
    stage: pledgeStageValidator,
    notes: optionalText,
    updatedAt: v.number(),
  })
    .index("by_institution_stage", ["institutionId", "stage"])
    .index("by_campaign_stage", ["campaignId", "stage"])
    .index("by_household", ["householdId"])
    .index("by_person", ["personId"]),

  // --- Content ---------------------------------------------------------------

  pages: defineTable({
    institutionId: v.id("institutions"),
    slug: v.string(),
    title: v.string(),
    summary: optionalText,
    layout: v.array(metadataValidator),
    seoTitle: optionalText,
    seoDescription: optionalText,
    status: pageStatusValidator,
    updatedAt: v.number(),
  })
    .index("by_institution_slug", ["institutionId", "slug"])
    .index("by_institution_status", ["institutionId", "status"]),

  siteSettings: defineTable({
    institutionId: v.id("institutions"),
    key: v.string(),
    value: metadataValidator,
    updatedAt: v.number(),
  }).index("by_institution_key", ["institutionId", "key"]),

  media: defineTable({
    institutionId: v.id("institutions"),
    storageId: v.optional(v.id("_storage")),
    filename: v.string(),
    mimeType: v.string(),
    altText: optionalText,
    metadata: metadataValidator,
    updatedAt: v.number(),
  }).index("by_institution", ["institutionId"]),
});
