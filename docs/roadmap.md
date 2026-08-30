# Roadmap

## Where we are

The platform core is real and tested: multi-tenant institutions, staff roles
with enforcement on every function, audit logging, domain events with a
retrying processor, the membership CRM (households, people, memberships,
search), a financial ledger (charges/payments/credits with atomic balance
updates), ShulCloud CSV import for accounts and people (idempotent re-runs
via external references), per-institution CMS pages with a dashboard editor
and publish flow on a public site route, and a staff dashboard covering all
of it.

## Principles

- Convex is the single system of record; modules share one backend boundary
  and one authorization model.
- Async work uses Convex scheduling and crons before any extra infrastructure.
- Self-hosting is a first-class deployment path.
- Business data stays typed and component-renderable; `metadata` bags are for
  import fidelity only.
- Every module ships with tests or it isn't done.

## Near term

1. **Staff invite links** — replace add-by-email-match with token-based
   invites, closing the unverified-email trust gap called out in
   [architecture.md](./architecture.md).
2. **Contact details in the dashboard** — addresses and contact points are
   in the schema and populated by the importer; give them UI on
   household/person pages.
3. **Yahrzeits module** — the first ritual module: `@hebcal/core`-backed
   Hebrew-date conversion, yahrzeit records tied to `personLifecycleEvents`,
   and `yahrzeit.upcoming` domain events for reminders.
4. **Member portal** — `personUserLinks` exists; add invite flow, a member
   view of their own household, and balance visibility.
5. **Communications** — email delivery through the domain-event processor
   (Mailpit locally), starting with staff-triggered announcements.
6. **Recurring dues billing** — generate annual/monthly charges onto the
   ledger from a dues schedule.
7. **MCP server for agents** — expose the membership/finance data over MCP
   (institution-scoped, role-aware) so AI agents can query it safely.

## Later

- Production container image for the self-hosted web app (the compose stack
  currently runs the Next.js dev server).

- Events module (registration, capacity, payments hook).
- Fundraising (campaigns, pledges) and real invoicing on top of the balance
  records.
- School enrollment; High Holiday seating; cemetery records.
- Reporting and exports across modules.
- Page editor with typed layout blocks (the schema already stores
  `layout` as structured blocks, not HTML).
- Ownership transfer and finer-grained permissions if real usage demands it.
