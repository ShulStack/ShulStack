[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FShulStack%2FShulStack&project-name=shulstack&repository-name=shulstack&root-directory=apps%2Fweb&demo-title=ShulStack&demo-description=Open-source%20synagogue%20operating%20system&products=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22convex%22%2C%22productSlug%22%3A%22convex%22%2C%22protocol%22%3A%22storage%22%7D%5D) [![CI](https://github.com/ShulStack/ShulStack/actions/workflows/ci.yaml/badge.svg)](https://github.com/ShulStack/ShulStack/actions/workflows/ci.yaml)

# ShulStack

**The open-source operating system for synagogues.** A community-owned
alternative to ShulCloud: membership CRM, a real financial ledger, a public
website, and the ritual-calendar workflows generic tools never get right.
MIT-licensed, one-click deployable, and built to be self-hosted.

## Deploy in one click

The **Deploy** button above creates everything: a Vercel project for the app
and a [Convex](https://convex.dev) project for the database via the Vercel
Marketplace — hosting and database billed in one Vercel account, auth keys
generated automatically during the build. Click it, wait for the build, sign
up, create your institution, and click **Load sample data**.

Details, the demo-plus-production two-instance pattern, and troubleshooting:
[docs/deploy-vercel.md](./docs/deploy-vercel.md).

## Status: early, honest

The platform core works today and is covered by an automated test suite
(100+ tests across the backend, domain packages, and UI):

- **Institutions & staff** — multi-tenant workspaces with `owner` / `admin` /
  `staff` roles, enforced on every backend function, with an audit trail.
- **CRM** — households, people (including Hebrew name fields), household
  membership with roles, search, and soft-deactivation.
- **Finance ledger** — charges, payments, and credits that atomically move
  household balances. The ledger is the *only* writer of balances; snapshots
  are derived, and an admin reconciliation check proves the books tie out.
  Money is integer minor units end to end.
- **ShulCloud import** — upload the accounts, people, and transactions CSV
  exports and get households, people, memberships, contact info, and the full
  charge/payment history on each household's ledger. Re-running an import
  never duplicates records, and imported transaction detail replaces the
  summary opening balance instead of double-counting it.
- **Website** — per-institution pages with a block editor and
  draft/publish/archive flow, served on a cached public site route.
- **Fundraising** — campaigns with goals, a pledge pipeline (prospect →
  cultivating → asked → pledged → fulfilled) on a board with per-stage
  rollups, a filterable institution-wide pledge screening table, and gifts
  that land on the household ledger as matched charge/payment pairs. Pledges
  surface on person and household pages.
- **HTTP API** — a versioned REST API over households, people, ledgers, and
  institution-wide transactions, with read and write scopes on hashed,
  institution-scoped API keys managed from the in-app Developer section
  (which also hosts the live API reference).
- **Sruly, the membership agent** — an optional AI assistant bundled into
  your deployment ([Vercel eve](https://vercel.com/docs/eve)): staff ask
  about households, birth dates, balances, and giving history in plain
  language. Read-only tools over the HTTP API, in-app chat, two env vars to
  enable. See [docs/agents.md](./docs/agents.md).
- **Domain events** — mutations emit events (`household.created`, …)
  processed by an idempotent, self-draining background processor with a
  failed-event requeue path.
- **Sample data** — one click loads a realistic demo dataset into an empty
  institution.

Most of the module registry (events, yahrzeits, seating, school, …) is
roadmap, not product. See [docs/roadmap.md](./docs/roadmap.md).

## The stack (radically simple)

- **Backend**: [Convex](https://convex.dev) — database, functions, realtime,
  scheduler, and auth in one deployable unit. The entire backend is the
  `convex/` directory.
- **Auth**: [Convex Auth](https://labs.convex.dev/auth) with a password
  provider — no external auth service.
- **Frontend**: Next.js 16 + React 19. Styling is one hand-written global
  stylesheet with CSS variables — no Tailwind, no component framework;
  `packages/ui` is seven small in-repo React primitives.
- **Monorepo**: pnpm + Turborepo; toolchain pinned with Hermit; Biome for
  lint/format; Vitest + `convex-test` for the test suite.

## Quickstart (local)

Toolchain (node, pnpm, task) is pinned via [Hermit](https://cashapp.github.io/hermit/) — no global installs needed.

```sh
./bin/task bootstrap          # install dependencies, create .env
./bin/task dev                # start Convex (local dev deployment) + the web app
```

On the first run the Convex CLI asks how to provision a deployment — choosing
to try Convex **without an account** keeps everything on your machine. Then,
once per deployment, set up authentication keys:

```sh
./bin/task convex:auth-setup  # generate + store JWT keys for Convex Auth
```

Open [http://localhost:3000](http://localhost:3000), sign up, create an
institution, and click **Load sample data**.

> If the web app can't reach Convex, check that `NEXT_PUBLIC_CONVEX_URL` in
> `.env` matches the `CONVEX_URL` the CLI wrote to `.env.local`.

## Development

| Command | What it does |
| --- | --- |
| `./bin/task dev` | Convex dev deployment + Next.js dev server |
| `./bin/task test` | Backend suite (convex-test) + package unit/component tests |
| `./bin/task lint` | Biome checks |
| `./bin/task typecheck` | TypeScript across apps, packages, convex, and tests |
| `./bin/task do` | The full validation pass (lint, typecheck, test, build) |
| `./bin/task convex:codegen` | Regenerate `convex/_generated` after schema/function changes |

## Self-hosting

Beyond Vercel, the repo ships a Docker stack that runs the official
self-hosted Convex backend alongside the app (note: the web container
currently runs the dev server — a production image is on the roadmap):

```sh
docker compose up -d convex-backend convex-dashboard mailpit
./bin/task convex:admin-key        # print an admin key for the backend
# put the key in .env as CONVEX_SELF_HOSTED_ADMIN_KEY
./bin/task convex:auth-keys        # print JWT_PRIVATE_KEY + JWKS
pnpm convex env set -- JWT_PRIVATE_KEY "<key>"   # set on the deployment
pnpm convex env set -- JWKS '<jwks>'
pnpm convex env set -- SITE_URL http://localhost:3000
./bin/task convex:deploy           # push functions
docker compose up --build web      # or run the web app however you host Next.js
```

The Convex dashboard is at [http://localhost:6791](http://localhost:6791) and
Mailpit at [http://localhost:8025](http://localhost:8025).

## Repository layout

```
agents/sruly        Optional bundled AI agent (Vercel eve): membership Q&A
apps/web            Next.js app: public landing, staff dashboard, public site pages
convex              The entire backend: schema, functions, auth, crons, seed
convex/lib          Access control, audit logging, domain-event processing
packages/platform   Shared pure domain code: module registry, money, names, slugs
packages/ui         Shared presentational React components
scripts             Vercel build entrypoint + Convex Auth key setup
tests/convex        Backend test suite (convex-test)
docs                Architecture, data model, deployment, roadmap
```

Architecture rationale lives in [docs/architecture.md](./docs/architecture.md);
the CRM data model in [docs/data-model.md](./docs/data-model.md); Vercel
deployment in [docs/deploy-vercel.md](./docs/deploy-vercel.md).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). The short version: run
`./bin/task do` before you push, every backend function must enforce
authorization, and behavior changes come with tests.

## License

[MIT](./LICENSE)
