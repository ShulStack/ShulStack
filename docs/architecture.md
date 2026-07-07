# Architecture

ShulStack is a modular monolith: one Next.js application, one Convex backend,
one authorization model. This document records the load-bearing decisions.

## System shape

```
apps/web (Next.js)
  ├─ /                      public landing page
  ├─ /app/...               staff dashboard (client components, live queries)
  └─ /sites/[slug]/[page]   public CMS pages (server-rendered per request)

convex/ (the entire backend)
  ├─ schema.ts              all tables + indexes
  ├─ lib/access.ts          requireUser / requireStaff (the authorization gate)
  ├─ lib/audit.ts           audit log writes (internal-only)
  ├─ lib/domainEvents.ts    event emission + handler registry
  ├─ platform.ts            institutions, staff, modules, audit reads
  ├─ crm.ts / finance.ts / content.ts / users.ts / seed.ts
  ├─ events.ts              internal event processor
  └─ crons.ts               retry sweeper
```

**Why Convex as the single backend:** it collapses five pieces of
infrastructure (Postgres, an ORM, an auth adapter, a job worker, and a CMS)
into one system that provides transactions, realtime subscriptions, scheduled
functions, file storage, and a self-hostable open-source backend. For a
volunteer-maintained project, fewer moving parts is the feature. `convex-test`
runs the entire backend in-process, so the full suite finishes in under a
second.

## Multi-tenancy and authorization

Every business table carries an `institutionId`. Authorization is app-owned
and lives in one place:

- `staffMembers` links an auth user to an institution with a role:
  `owner` > `admin` > `staff`.
- Every staff-facing query/mutation starts with
  `requireStaff(ctx, institutionId, minimumRole)`. There are no unauthorized
  code paths to forget — a function without a gate is a bug by convention,
  and the test suite asserts cross-tenant denial.
- Role rules: staff read/write CRM and finance records; admins manage
  modules, settings, content, and staff; only the owner grants the admin
  role; ownership is not transferable through the API (yet).
- `personUserLinks` (member portal, future) is deliberately separate from
  `staffMembers`: being staff and being a member are independent facts.

Public reads (published CMS pages) are the only unauthenticated functions,
and they are read-only and status-gated.

## Audit log and domain events

Both are written *inside* the mutation that performed the change — there is
no client-callable "write audit log" endpoint, so the trail cannot be forged.

- **Audit logs** answer "who changed what": actor, entity, action,
  before/after summaries.
- **Domain events** are facts for the system to react to
  (`household.created`, `membership.changed`, …). `emitDomainEvent` inserts
  the event and schedules near-immediate processing; a cron sweeps every few
  minutes as the retry path. Handlers must be idempotent (Convex has no
  sub-transactions, so a failed handler may leave partial writes behind
  before its retry). After `MAX_EVENT_ATTEMPTS` failures an event lands in
  `failed` with the error recorded.

The first real handler provisions a billing profile for every new household,
so finance flows never see a missing profile.

## Conventions

- **Money** is integer minor units (`balanceMinor`), never floats or strings.
  Parsing/formatting live in `@shulstack/platform` (`parseMoney`,
  `formatMoney`) and are string/BigInt-based.
- **Timestamps**: Convex's built-in `_creationTime` is the creation
  timestamp; tables carry `updatedAt` only when rows mutate. Calendar dates
  (joins, birthdays, balance as-of) are ISO `YYYY-MM-DD` strings — they are
  civil dates, not instants.
- **Display names** are denormalized (`people.displayName`,
  `households.displayName`) and recomputed on every write; search indexes
  target them with `institutionId` as a filter field.
- **`metadata` bags** exist for import fidelity and module edge cases only.
  Canonical business data gets typed columns.
- **Module registry** has one source of truth: `packages/platform`. The
  Convex schema derives its `moduleSlug` validator from it, and the UI
  renders from it.

## Testing strategy

- `tests/convex/*` runs the real backend (schema, functions, scheduler,
  search) in-process via `convex-test`, with a `signUp` helper that forges
  the Convex Auth identity. Access control, CRM flows, finance math, content
  publishing, and event retry semantics are all covered here.
- `packages/platform` has pure unit tests (money, names, slugs).
- `packages/ui` has jsdom component tests.
- The password-provider handshake itself (JWT issuance) is Convex Auth's
  code, not ours, and is exercised manually / in smoke tests rather than unit
  tests.

## Scaling honesty

Dashboard counts `collect()` whole indexed ranges — fine at synagogue scale
(hundreds to low thousands of records per institution), and the code says so.
If an institution ever exceeds tens of thousands of records, switch to
materialized counters maintained by the domain-event processor. Lists exposed
to the UI are paginated (`usePaginatedQuery`); search goes through search
indexes, not scans.
