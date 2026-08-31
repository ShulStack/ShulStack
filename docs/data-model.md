# Data Model

The canonical business-data model, grounded in real ShulCloud exports
(reviewed March 2026) but deliberately not shaped like them. The goal is to
preserve the information synagogues actually have in a cleaner model that
supports imports, operational workflows, and future modules.

## Core tables

Tables marked *reserved* are in the schema for modules that haven't landed
yet — no code reads or writes them today.

| Table | Holds |
| --- | --- |
| `institutions` | The tenant: one congregation per row |
| `staffMembers` | Auth user ↔ institution with `owner`/`admin`/`staff` role |
| `personUserLinks` | Auth user ↔ CRM person (member portal — *reserved*) |
| `moduleEnablement` | Which modules are switched on per institution |
| `apiKeys` | Hashed, institution-scoped keys for the read-only HTTP API |
| `auditLogs` | Who changed what (written only inside mutations) |
| `domainEvents` | Facts to react to, with retry/attempt tracking |
| `households` | The household / billing unit |
| `people` | The individual, including Hebrew name and lifecycle fields |
| `householdMembers` | Person ↔ household with role and contact flags |
| `householdAddresses` | Structured postal addresses (written by the importer) |
| `personAddresses` | Person-level addresses (*reserved*) |
| `householdContactPoints` / `personContactPoints` | Typed emails and phones |
| `personAffiliations` | Employers and schools (*reserved*) |
| `personLifecycleEvents` | B'nei mitzvah, weddings, deaths, … (*reserved*) |
| `tags` / `tagAssignments` | Reusable labels on any entity (*reserved*) |
| `externalReferences` | Source-system ids (ShulCloud ids, billing ids) |
| `householdBillingProfiles` | Delivery method, discounts, and the live balance (maintained only by the ledger) |
| `householdBalanceSnapshots` | Dated snapshots derived from the ledger |
| `ledgerEntries` | Immutable charges/payments/credits/opening balances; each entry atomically moves the profile balance, and `finance.reconcileBalances` verifies the sum |
| `campaigns` | Fundraising campaigns with optional goals and date ranges |
| `pledges` | Pipeline records (household + optional person attribution); `paidMinor` is written only by `fundraising.recordPledgePayment`, which also posts the gift to the ledger as a matched charge/payment pair; `notes` is plain text derived from the rich `notesDoc` |
| `pledgeInstallments` | Multi-year commitment schedules: dated splits of a pledge; when present, the schedule's sum owns the pledge's `amountMinor` (via `setPledgeSchedule`) |
| `pages` / `siteSettings` | Per-institution site content |
| `media` | Site media library (*reserved*) |

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
| Transactions export (charges & payments, with `Type` as category or method) | `ledgerEntries` via `recordLedgerEntry`; negative charges become credits, negative payments become reversal charges, and imported deltas are absorbed into the importer's opening-balance entry |
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
