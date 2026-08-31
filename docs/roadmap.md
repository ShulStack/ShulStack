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
   so AI agents can query it safely. The foundation shipped: the HTTP API
   with institution-scoped, read/write-scoped API keys; MCP rides on them.
8. **Bundled agents (Vercel eve)** — ship optional agents *inside* the main
   app via eve's `withEve()` multi-agent mount (researched 2026-08:
   eve is Vercel's Apache-2.0 agent framework, public preview since
   June 2026 — pin the version). Because every community already runs its
   own ShulStack deployment, bundling inherits per-shul isolation, billing,
   and keys, and agents update with the app — a separate deploy-button
   project would be a detached clone that never gets fixes. First agent:
   **Sruly**, membership Q&A over read-only API tools. Channel order: in-app
   web chat (same-origin, cookie auth) → Slack via Vercel Connect →
   WhatsApp as a documented guide (Meta Business setup is on the operator)
   → eve's MCP channel as a bonus. An "Agents" page under Developer is the
   enable/configure surface (toggling provisions the agent's scoped key).

## Fundraising CRM buildout

The fundraising core shipped (campaigns, the pledge pipeline board,
screening table, ledger-backed gifts). The next layers deliberately
reimplement the strongest UX patterns from Twenty (twentyhq/twenty) — its
code is AGPLv3 and cannot be copied into this MIT codebase, but its
patterns can be rebuilt, and each has a simpler Convex-native shape:

- **Saved views** — a `views` table (filters, sorts, visible columns,
  layout, shared/personal) so "Lapsed donors" or "Open pledges — Building"
  are one click.
- **Filter chips + operator registry** — composable field/operator/value
  filters rendered as removable chips, with a per-field-type operator map.
- **Inline cell editing** in the screening table (text/number/select
  first), so a phone fix or amount tweak doesn't require opening a record.
- **Side-panel record preview** driven by a `?record=` param, for triaging
  a filtered list without losing your place.
- **Stage timestamps** — record `stageEnteredAt` in the stage mutation to
  surface stuck pledges ("asked 60+ days ago") and expected receipts.
- **Donor enrichment** — attach research/enrichment data to households and
  people (the `metadata` bags and external references are ready for it).
- **`/` search + command menu** across members, households, and pledges.

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
