# Deploying to Vercel

ShulStack deploys to Vercel with one click, including the database: the
deploy button provisions a [Convex](https://convex.dev) project through the
Vercel Marketplace, so hosting **and** database billing live in your Vercel
account. There are no API keys to copy and no environment variables to type.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FShulStack%2FShulStack&project-name=shulstack&repository-name=shulstack&root-directory=apps%2Fweb&demo-title=ShulStack&demo-description=Open-source%20synagogue%20operating%20system&products=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22convex%22%2C%22productSlug%22%3A%22convex%22%2C%22protocol%22%3A%22storage%22%7D%5D)

## What the button does

1. Clones this repository into your GitHub/GitLab/Bitbucket account and
   creates a Vercel project with the root directory set to `apps/web`.
2. Installs the **Convex integration** from the Vercel Marketplace and
   provisions a Convex project (billed through Vercel), which injects
   `CONVEX_DEPLOY_KEY` into the Vercel project.
3. Runs the build. [`apps/web/vercel.json`](../apps/web/vercel.json) points
   the build at [`scripts/vercel-build.mjs`](../scripts/vercel-build.mjs),
   which:
   - generates Convex Auth's `JWT_PRIVATE_KEY` + `JWKS` on the Convex
     deployment if they aren't set yet (idempotent — it never regenerates),
   - sets `SITE_URL` on the Convex deployment from the Vercel production URL
     (and keeps it in sync when your domain changes),
   - runs `convex deploy`, pushing backend functions and building the web
     app with `NEXT_PUBLIC_CONVEX_URL` pointing at that deployment.

The result is a fully working instance: sign up, create your institution,
and either click **Load sample data** or run the ShulCloud import.

## After the first deploy

- **Sign up immediately.** The first account is yours; whoever creates an
  institution becomes its owner.
- **Close signups for a private instance.** Anyone who can reach the URL can
  register and create their *own* institution (they can never see yours —
  tenant isolation is enforced on every function). For a single-community
  deployment, set `ALLOW_NEW_INSTITUTIONS=false` in the Convex dashboard
  (Deployment → Settings → Environment Variables) after creating yours.
- **Adding staff:** staff are added by email match, and email ownership is
  not verified — only add addresses you have confirmed out-of-band, and
  ask people to sign up before you add them.
- **Custom domain:** add it in Vercel as usual. The next deploy updates the
  Convex-side `SITE_URL` automatically.

## The two-instance pattern

Running a public demo and a real congregation from the same repo works well:

1. **Demo instance** — deploy once with the button; every push to `main`
   auto-deploys. Load the sample data and leave signups open.
2. **Production instance** — in Vercel, **Add New → Project → Import** the
   same repository again (root directory `apps/web`), attach the Convex
   integration to it, and you get a second, fully isolated stack: separate
   Convex project, separate data, same code. Run your real imports there and
   set `ALLOW_NEW_INSTITUTIONS=false`.

## Preview deployments

`scripts/vercel-build.mjs` keys off `VERCEL_ENV` and the deploy key's scope:

- Production builds do the full bootstrap + deploy.
- Preview builds holding only a **production** deploy key skip the backend
  deploy and build the frontend against the production Convex deployment
  (branch code, production data — don't merge schema changes untested).
- Preview builds holding a **preview** deploy key get a fresh isolated
  Convex backend per branch, auth bootstrap included.

## Without the Marketplace (bring your own Convex account)

Create a Convex project yourself, generate a production deploy key in the
Convex dashboard, and set it as `CONVEX_DEPLOY_KEY` on the Vercel project
(Production scope). Everything else is identical — the build script does not
care where the key came from.

## Troubleshooting

- **Build fails with "NEXT_PUBLIC_CONVEX_URL is not set"** — the Convex
  integration isn't attached to this Vercel project (no `CONVEX_DEPLOY_KEY`),
  so the script built frontend-only. Attach the integration, or set
  `CONVEX_DEPLOY_KEY` yourself.
- **Sign-in fails after deploy** — check the Convex deployment's env vars
  for `JWT_PRIVATE_KEY`, `JWKS`, and `SITE_URL`; redeploying on Vercel
  re-runs the bootstrap.
- **Public site 404s** — the page must be **published**, and the Website
  module must be enabled in Settings. Published changes can take up to five
  minutes to appear (public pages are cached).
- **"This server is not accepting new institutions"** — you (or the
  operator) set `ALLOW_NEW_INSTITUTIONS=false`; unset it in the Convex
  dashboard to reopen signups.
