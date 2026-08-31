# Bundled agents (Vercel eve)

ShulStack ships optional AI agents *inside* the main deployment, built on
[eve](https://vercel.com/docs/eve), Vercel's open-source agent framework
(public preview — the pinned version in `agents/*/package.json` is the
supported one). Because every community runs its own ShulStack deployment,
each community's agents are automatically isolated: their own API key, their
own model billing (via Vercel's AI Gateway, on your account), their own
session history — and agent fixes arrive with normal ShulStack updates.

The first agent is **Sruly** (`agents/sruly`), a read-only membership and
analytics assistant: who's in a household, birth dates, Hebrew names,
balances, giving history — plus community-wide analytics ("who gave over
$10,000", "top donors this year", "how much in dues") through the API's
aggregation endpoints, and campaign/pledge questions. His entire capability
is read-only tools over the ShulStack HTTP API; eve's default
shell/file/web tools are explicitly disabled.

Beyond the full chat page, Sruly is available as a **collapsible panel on
every dashboard page** (the "Ask Sruly" button, shown whenever the agent is
running). Each message carries the current page path as ephemeral context —
never stored in session history — and a `get_page_data` tool lets him read
the data behind the page you're on, so "who's in this household?" just
works. Recognized tool results render as cards with money bars; anything
else falls back to collapsible JSON. (We evaluated tool-ui.com for richer
cards: nice work, but it's built on Tailwind/Radix/shadcn, which this
codebase deliberately avoids — the pattern is reimplemented in the app's
own CSS instead.)

## Enable on Vercel

1. On **Developer → API keys**, create a **read-only** key named "Sruly"
   and copy the secret.
2. In the Vercel project's environment variables, add:
   - `AGENTS_ENABLED=true`
   - `SHULSTACK_AGENT_API_KEY=ssk_…` (the key from step 1)
3. Redeploy. The **Developer → Agents** page shows Sruly as running, with an
   in-app chat.

That's the whole setup: the agent finds the API automatically (from the
Convex integration's deploy key), and model calls route through Vercel's
[AI Gateway](https://vercel.com/docs/ai-gateway) using the deployment's own
identity — no model API keys to manage. The Gateway has a free tier;
budgets and spend limits are available in the Vercel dashboard.

## Who can talk to Sruly

The agent's HTTP routes fail closed. Accepted callers:

- **Signed-in ShulStack users** — the in-app chat sends the user's Convex
  Auth token, verified against your deployment's own OIDC issuer.
- Vercel OIDC callers within the project (eve's own tooling).
- Local `eve dev` during development.

Everyone else gets a 401. Note the chat is available to any signed-in user
of the app; Sruly's answers are limited by his read-only key, and the chat
UI lives on an admin page.

## Local development

Run the app with agents enabled:

```sh
AGENTS_ENABLED=true SHULSTACK_AGENT_API_KEY=ssk_… ./bin/task dev
```

`withEve` starts eve's dev server alongside Next.js and proxies
`/eve/agents/sruly/*` to it. Locally there is no Vercel OIDC identity for
the AI Gateway, so model calls need `AI_GATEWAY_API_KEY` in the
environment (create one in the Vercel dashboard under AI Gateway), or run
`vercel link` + `vercel env pull` for OIDC-based local auth.

## Adding another agent

Each agent is a directory under `agents/` (its own `package.json`,
`agent/instructions.md`, `agent/tools/*.ts`) plus one line in
`apps/web/next.config.mjs`'s `agents` map. Scope each agent with its own
API key — read-only unless the job truly needs writes (write tools should
carry eve `approval` gates).

## Channels roadmap

- **In-app web chat** — shipped (same-origin, cookie/JWT auth).
- **Slack** — next: eve has a first-class Slack channel via Vercel Connect
  (near-zero credential setup).
- **WhatsApp** — possible today via eve's Chat SDK channel and the official
  WhatsApp Cloud API adapter, but it requires a Meta Business app, webhook
  configuration, and token management; a step-by-step guide will land when
  the flow is worth an operator's time.
- **MCP** — eve can expose the agent itself over MCP (`channel/mcp`) so
  Sruly can be added to Claude and other MCP clients.
