# Contributing to ShulStack

Thanks for helping build community-owned synagogue software. This guide keeps
contributions smooth.

## Setup

```sh
./bin/task bootstrap        # toolchain is pinned via Hermit; this installs deps
./bin/task dev              # Convex dev deployment + web app
./bin/task convex:auth-setup  # once per deployment: JWT keys for Convex Auth
```

See the README quickstart for details. Everything runs locally; no accounts
or cloud services are required.

## Before you push

```sh
./bin/task do               # lint + typecheck + test + build
```

CI runs exactly this. Formatting is Biome (`./bin/task format`).

## The rules that matter

1. **Every staff-facing Convex function starts with `requireStaff`.** Pick
   the minimum role deliberately (`staff` for CRM work, `admin` for
   settings/content/staff management). Public functions must be read-only
   and clearly justified.
2. **Mutations that change business data write an audit entry** via
   `logAudit`, and emit a domain event via `emitDomainEvent` when other parts
   of the system might care. Never expose audit/event writes to clients.
3. **Money is integer minor units.** Use `parseMoney`/`formatMoney` from
   `@shulstack/platform` at the edges.
4. **Behavior changes come with tests.** Backend behavior is tested in
   `tests/convex/` with `convex-test` — these are fast, real-backend tests;
   there is no excuse to skip them. Access-control tests (who *can't* do the
   thing) are as important as the happy path.
5. **Run `./bin/task convex:codegen`** after changing the schema or function
   signatures, and commit the regenerated `convex/_generated`.
6. **One source of truth.** Module identity lives in `packages/platform`;
   shared pure logic belongs there too, where it's unit-testable.

## Adding a backend function: checklist

- [ ] Args validated with `convex/values` validators (shared ones live in
      `convex/lib/validators.ts`)
- [ ] `requireStaff(ctx, institutionId, role)` (or documented reason not to)
- [ ] Tenancy: every read/write scoped to the caller's institution
- [ ] `logAudit` / `emitDomainEvent` where appropriate
- [ ] Pagination or `take()` — no unbounded `collect()` on user-visible lists
- [ ] Tests in `tests/convex/`, including a denial case

## Project structure

See the README's repository layout and `docs/architecture.md` for the
reasoning behind the shape.

## Conduct

Be kind. Assume good faith. Disagreements are about code, not people.
