# Architecture

ShulStack is a modular monolith: one Next.js application, one Convex backend,
one authorization model. This document records the load-bearing decisions.

## System shape

```
apps/web (Next.js)
  ├─ /                      public landing page (static)
  ├─ /app/...               staff dashboard (client components, live queries;
  │                         auth + Convex providers mount here, not globally)
  └─ /sites/[slug]/[page]   public CMS pages (cached, revalidated every 5 min)

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
  role or changes an existing admin's role/access; ownership is not
  transferable through the API (yet).
- `personUserLinks` (member portal, future) is deliberately separate from
  `staffMembers`: being staff and being a member are independent facts.
- **Known trade-off:** `addStaffByEmail` grants access by email match, and
  the password provider does not verify email ownership. Admins must only
  add addresses they have confirmed out-of-band; token-based invite links
  are on the roadmap.

Unauthenticated function surface: published CMS page reads (status-gated,
and dark when the website module is off), plus identity-reflection queries
(`users.current`, `platform.listMyInstitutions`, `platform.getWorkspace`)
that return null/empty when signed out. `platform.createInstitution` needs
only a signed-in user; single-community deployments close it by setting
`ALLOW_NEW_INSTITUTIONS=false` on the Convex deployment.

## Audit log and domain events

Both are written *inside* the mutation that performed the change — there is
no client-callable "write audit log" endpoint, so the trail cannot be forged.

- **Audit logs** answer "who changed what": actor, entity, action,
  before/after summaries.
- **Domain events** are facts for the system to react to
  (`household.created`, `membership.changed`, …). `emitDomainEvent` inserts
  the event and schedules a drain only when the pending queue was empty; the
  processor reschedules itself while batches stay full, and a cron sweeps
  every few minutes as the retry path. Handlers must be idempotent (Convex
  has no sub-transactions, so a failed handler may leave partial writes
  behind before its retry). After `MAX_EVENT_ATTEMPTS` failures an event
  lands in `failed` with the error recorded; admins can inspect and requeue
  via `events.listFailedEvents` / `events.retryFailedEvent`.

The first real handler provisions a billing profile for every new household,
so finance flows never see a missing profile.

## Fundraising

Campaigns and pledges (`fundraising.ts`) sit on top of the CRM and the
ledger rather than beside them: a pledge references the household (the
billing unit) with optional person attribution, the pipeline stage lives on
the pledge and is only advanced by mutations, and `recordPledgePayment`
writes each gift onto the household ledger as a matched charge/payment pair
(net zero on the balance, the same shape gifts have in ShulCloud exports)
while bumping the pledge's `paidMinor`. The ledger therefore stays the
single source of financial truth; campaign rollups are derived, never
stored.

## Bundled agents

Optional AI agents live in `agents/*` (Vercel's eve framework, version
pinned) and mount into the web app via `withEve()` when
`AGENTS_ENABLED=true` — same origin, same deployment, same per-community
isolation as everything else. An agent's entire capability is its tool
files: Sruly's tools wrap the HTTP API (authenticated with an
operator-created key in `SHULSTACK_AGENT_API_KEY`, whose read/write scope
bounds what he can do), money-writing tools sit behind eve approval gates
(the user clicks Approve in chat before they execute), and eve's default
shell/file/web tools are explicitly disabled. Route auth
fails closed, accepting ShulStack users' Convex Auth JWTs (verified against
the deployment's own OIDC issuer), Vercel OIDC, or local dev. Details:
[agents.md](./agents.md).

## The HTTP API and API keys

`convex/httpApi.ts` (reads) and `convex/httpApiWrites.ts` (writes) serve a
versioned REST API (`/api/v1/…`) on the deployment's site URL, and the
planned MCP server will ride on it. Its principals are **API keys**
(`developer.ts`), not users: institution-scoped, admin-managed, `ssk_…`
secrets shown once and stored only as SHA-256 hashes. Every handler resolves
the key first and scopes every read and write to its institution; IDs from
other institutions 404 exactly like missing IDs. The data queries and
mutations behind the handlers are internal functions — the only public
surface is the router itself. Keys carry scopes: every key has `read`, and
keys created with `write` (which always implies `read`) may also POST/PATCH
households, people, memberships, and ledger entries. Write handlers return
403 `insufficient_scope` for read-only keys; every write goes through the
same audit-log, domain-event, and `recordLedgerEntry` paths as the staff
mutations, with the acting key recorded in the audit entry. There are no
DELETE endpoints because the backend has no delete mutations by design.

## Conventions

- **Money** is integer minor units (`balanceMinor`), never floats or strings.
  Parsing/formatting live in `@shulstack/platform` (`parseMoney`,
  `formatMoney`) and are string/BigInt-based.
- **The ledger owns balances.** `recordLedgerEntry` is the only code path
  that moves `balanceMinor`; snapshots are derived records and billing
  profiles carry preferences only. `finance.reconcileBalances` compares
  every profile against its ledger sum, and `finance.repairHouseholdBalance`
  is the sanctioned fix.
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
