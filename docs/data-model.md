# Data Model

The canonical business-data model, grounded in real ShulCloud exports
(reviewed March 2026) but deliberately not shaped like them. The goal is to
preserve the information synagogues actually have in a cleaner model that
supports imports, operational workflows, and future modules.

## Core tables

| Table | Holds |
| --- | --- |
| `institutions` | The tenant: one congregation per row |
| `staffMembers` | Auth user ↔ institution with `owner`/`admin`/`staff` role |
| `personUserLinks` | Auth user ↔ CRM person (member portal, future) |
| `moduleEnablement` | Which modules are switched on per institution |
| `auditLogs` | Who changed what (written only inside mutations) |
| `domainEvents` | Facts to react to, with retry/attempt tracking |
| `households` | The household / billing unit |
| `people` | The individual, including Hebrew name and lifecycle fields |
| `householdMembers` | Person ↔ household with role and contact flags |
| `householdAddresses` / `personAddresses` | Structured postal addresses |
| `householdContactPoints` / `personContactPoints` | Typed emails and phones |
| `personAffiliations` | Employers and schools |
| `personLifecycleEvents` | B'nei mitzvah, weddings, deaths, … with Hebrew dates |
| `tags` / `tagAssignments` | Reusable labels on any entity |
| `externalReferences` | Source-system ids (ShulCloud ids, billing ids) |
| `householdBillingProfiles` | Delivery method, discounts, live balance |
| `householdBalanceSnapshots` | Dated balance history |
| `ledgerEntries` | Immutable charges/payments/credits/opening balances; each entry atomically moves the profile balance |
| `pages` / `siteSettings` / `media` | Per-institution site content |

Plus the Convex Auth tables (`users`, `authSessions`, …) via `authTables`.

## Conventions that matter

- **Denormalized display names.** `people.displayName` and
  `households.displayName` are the one canonical rendering used by lists and
  search indexes. Recomputed on every write from name parts
  (`buildPersonDisplayName` in `@shulstack/platform`).
- **Money in minor units.** `balanceMinor: number` (integer cents). Positive
  means the household owes; negative means credit.
- **Dates.** `_creationTime` for creation instants, `updatedAt` epoch millis
  for mutations, ISO `YYYY-MM-DD` strings for civil dates.
- **`metadata` bags** on most tables hold import fidelity and edge cases —
  never canonical data. ShulCloud-specific print workflow fields (family
  cards, mail labels beyond the basics, "new signup" flags) belong here, not
  in columns.

## Mapping ShulCloud exports

| ShulCloud export shape | ShulStack representation |
| --- | --- |
| `accounts.id`, `Primary Member ID`, `external_billing_id` | `externalReferences` |
| Account name/type, joined/resigned dates | `households` |
| Person names, gender, Hebrew fields, dob, deceased | `people` |
| `person_type`, `is_primary_contact`, active flags | `householdMembers` + `people.isActive` |
| Address columns (account + person) | `householdAddresses`, `personAddresses` |
| Phones, mobiles, emails, faxes | `householdContactPoints`, `personContactPoints` |
| Business/school fields | `personAffiliations` |
| Lifecycle dates and locations | `personLifecycleEvents` |
| Billing method, discounts, balances | `householdBillingProfiles`, `householdBalanceSnapshots` |
| `tags` | `tags` + `tagAssignments` |
| Family-card/print-workflow columns | `households.metadata` |

We intentionally do not create columns like `husband_first`, `wife_last`,
`childrens_names`, or `primary_email`. Those are projections of canonical
relationships (households have members; members have roles and contact
flags; people own their names and contact methods), and materializing them
invites update drift.

## Domain events

Current event names: `household.created`, `household.updated`,
`membership.changed`. Planned as modules land: `invoice.issued`,
`payment.completed`, `payment.failed`, `event.registration.created`,
`donation.received`, `seat.request.submitted`, `student.enrolled`,
`yahrzeit.upcoming`, `message.delivery.completed`.

Events carry an `attempts` counter; handlers are idempotent and events fail
permanently (status `failed`, error recorded) after `MAX_EVENT_ATTEMPTS`.
