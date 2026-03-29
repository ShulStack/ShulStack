# ShulStack

Open-source synagogue operating system, built as a modular monolith.

## Workspace

This repository is scaffolded as a `pnpm` workspace powered by `Turborepo`.

- `apps/web`: Next.js app for the public site, member portal, staff dashboard, and Payload admin
- `apps/worker`: Graphile Worker process for async jobs and scheduled tasks
- `packages/db`: Drizzle schema, database client, and migrations
- `packages/auth`: Better Auth scaffolding and RBAC primitives
- `packages/platform`: shared platform constants and module registry
- `packages/cms`: Payload collections, globals, and block definitions
- `packages/ui`: shared React UI building blocks

## Tooling

The preferred entrypoint is the root [Taskfile](./Taskfile.yaml).

Common commands:

- `./bin/task bootstrap`: install dependencies and create a local `.env` if needed
- `./bin/task dev`: start Postgres + Mailpit, then run the web app and worker
- `./bin/task build`: build the workspace
- `./bin/task lint`: run repository lint checks
- `./bin/task typecheck`: run TypeScript checks
- `./bin/task test`: run the test suite
- `./bin/task do`: run the full validation pass

## Local Development

1. Run `./bin/task bootstrap`
2. Run `./bin/task dev`
3. Open [http://localhost:3000](http://localhost:3000)
4. Open [http://localhost:8025](http://localhost:8025) for Mailpit

The default local services are defined in [`docker-compose.yaml`](./docker-compose.yaml).

## CMS and Site Builder

Payload is scaffolded as the CMS foundation. The v1 editing model is:

- structured page sections via typed Payload blocks
- shared site-wide settings via Payload globals
- Payload admin routed through the Next.js app
- live-preview-friendly content structures

The roadmap and architecture rationale live in [docs/roadmap.md](./docs/roadmap.md).
