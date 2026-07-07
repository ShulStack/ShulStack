import { MODULES } from "@shulstack/platform";
import { v } from "convex/values";

/**
 * Free-form JSON bag reserved for import fidelity and module-specific edge
 * cases. Canonical business data belongs in typed columns, never in here.
 */
export const metadataValidator = v.record(v.string(), v.any());

/** ISO 8601 calendar date, e.g. "2026-03-29". Timezone-free by design. */
export const isoDate = v.string();
export const optionalIsoDate = v.optional(isoDate);

export const staffRoleValidator = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("staff"),
);
export type StaffRole = "owner" | "admin" | "staff";

const moduleSlugLiterals = MODULES.map((module) => v.literal(module.slug));
export const moduleSlugValidator = v.union(...moduleSlugLiterals);

export const auditActionValidator = v.union(
  v.literal("create"),
  v.literal("update"),
  v.literal("delete"),
  v.literal("publish"),
);

export const domainEventStatusValidator = v.union(
  v.literal("pending"),
  v.literal("processed"),
  v.literal("failed"),
);

export const genderValidator = v.union(
  v.literal("male"),
  v.literal("female"),
  v.literal("nonbinary"),
  v.literal("unknown"),
);

export const householdMemberRoleValidator = v.union(
  v.literal("head"),
  v.literal("spouse"),
  v.literal("child"),
  v.literal("dependent_adult"),
  v.literal("other"),
);

export const addressTypeValidator = v.union(
  v.literal("home"),
  v.literal("mailing"),
  v.literal("billing"),
  v.literal("work"),
  v.literal("seasonal"),
  v.literal("other"),
);

export const contactPointTypeValidator = v.union(v.literal("email"), v.literal("phone"));

export const contactPointLabelValidator = v.union(
  v.literal("home"),
  v.literal("mobile"),
  v.literal("work"),
  v.literal("fax"),
  v.literal("billing"),
  v.literal("login"),
  v.literal("other"),
);

export const affiliationTypeValidator = v.union(
  v.literal("employer"),
  v.literal("school"),
  v.literal("other"),
);

export const lifecycleEventTypeValidator = v.union(
  v.literal("bnei_mitzvah"),
  v.literal("confirmation"),
  v.literal("wedding"),
  v.literal("anniversary"),
  v.literal("ufruf"),
  v.literal("death"),
  v.literal("other"),
);

export const ledgerEntryTypeValidator = v.union(
  v.literal("charge"),
  v.literal("payment"),
  v.literal("credit"),
  v.literal("opening_balance"),
);
export type LedgerEntryType = "charge" | "payment" | "credit" | "opening_balance";

export const pageStatusValidator = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("archived"),
);
