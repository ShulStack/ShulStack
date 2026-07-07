# ShulStack

[![CI](https://github.com/ShulStack/ShulStack/actions/workflows/ci.yaml/badge.svg)](https://github.com/ShulStack/ShulStack/actions/workflows/ci.yaml)

**The open-source operating system for synagogues.** A community-owned
alternative to ShulCloud: membership CRM, billing records, a public website,
and the ritual-calendar workflows generic tools never get right. MIT-licensed
and built to be self-hosted.

## Status: early, honest

The platform core works today and is covered by an automated test suite:

- **Institutions & staff** — multi-tenant workspaces with `owner` / `admin` /
  `staff` roles, enforced on every backend function, with an audit trail.
- **CRM** — households, people (including Hebrew name fields), household
  membership with roles, search, and soft-deactivation.
- **Finance records** — household billing profiles and dated balance
  snapshots. Money is integer minor units end to end.
- **Content** — per-institution pages with draft/published/archived states,
  served on a public site route.
- **Domain events** — mutations emit events (`household.created`, …) that are
  processed by an idempotent, retrying background processor.
- **Sample data** — one click loads a realistic demo dataset into an empty
  institution.

Most of the module registry (events, yahrzeits, seating, school, …) is
roadmap, not product. See [docs/roadmap.md](./docs/roadmap.md).

## Quickstart

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

The production-like stack runs the official self-hosted Convex backend in
Docker alongside the app:

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
apps/web            Next.js app: public landing, staff dashboard, public site pages
convex              The entire backend: schema, functions, auth, crons, seed
convex/lib          Access control, audit logging, domain-event processing
packages/platform   Shared pure domain code: module registry, money, names, slugs
packages/ui         Shared presentational React components
tests/convex        Backend test suite (convex-test)
docs                Architecture, data model, roadmap
```

Architecture rationale lives in [docs/architecture.md](./docs/architecture.md);
the CRM data model in [docs/data-model.md](./docs/data-model.md).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). The short version: run
`./bin/task do` before you push, every backend function must enforce
authorization, and behavior changes come with tests.

## License

[MIT](./LICENSE)
