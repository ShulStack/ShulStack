/**
 * The agent's only line to the outside world: ShulStack's read-only HTTP API,
 * authenticated with an institution-scoped API key. The key never reaches the
 * model — tools run in the app runtime and return curated JSON.
 */

/**
 * The Convex deployment's site origin (where the HTTP API lives), derived
 * from whichever environment this deployment has:
 * - SHULSTACK_API_URL: explicit override (self-hosted, unusual setups)
 * - CONVEX_DEPLOY_KEY: present on Vercel via the Convex integration
 *   ("prod:<name>|..." → https://<name>.convex.site)
 * - NEXT_PUBLIC_CONVEX_URL: local dev (site URL is one port up; on Convex
 *   Cloud, .convex.cloud → .convex.site) — mirrors
 *   packages/platform/src/api-url.ts, inlined so the agent stays
 *   self-contained for eve's bundler.
 */
export function shulstackSiteUrl(): string {
  const explicit = process.env.SHULSTACK_API_URL;
  if (explicit !== undefined && explicit !== "") {
    return explicit.replace(/\/$/, "");
  }
  const deployKey = process.env.CONVEX_DEPLOY_KEY;
  if (deployKey?.startsWith("prod:")) {
    const name = deployKey.slice("prod:".length).split("|")[0];
    return `https://${name}.convex.site`;
  }
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (convexUrl !== undefined && convexUrl !== "") {
    const url = new URL(convexUrl);
    if (url.hostname.endsWith(".convex.cloud")) {
      url.hostname = `${url.hostname.slice(0, -".convex.cloud".length)}.convex.site`;
      return url.origin;
    }
    if (url.port !== "") {
      url.port = String(Number(url.port) + 1);
    }
    return url.origin;
  }
  throw new Error(
    "Cannot locate the ShulStack API: set SHULSTACK_API_URL (or deploy with the Convex integration).",
  );
}

/**
 * GET a ShulStack API path. Failures come back as readable text so the model
 * can explain the problem instead of hallucinating around it.
 */
function missingKeyError(): { error: string } {
  return {
    error:
      "SHULSTACK_AGENT_API_KEY is not configured. Create an API key on the Developer → API keys page and set it in this deployment's environment.",
  };
}

export async function shulstackGet(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<unknown> {
  const apiKey = process.env.SHULSTACK_AGENT_API_KEY;
  if (apiKey === undefined || apiKey === "") {
    return missingKeyError();
  }
  const url = new URL(`${shulstackSiteUrl()}/api/v1${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    return { error: `ShulStack API responded ${response.status}`, details: body };
  }
  return body;
}

/**
 * POST/PATCH to the write API. Undefined body fields are dropped so tools can
 * pass optional inputs straight through. A 403 means the configured key is
 * read-only — the error text tells the operator what to change.
 */
export async function shulstackSend(
  method: "POST" | "PATCH",
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const apiKey = process.env.SHULSTACK_AGENT_API_KEY;
  if (apiKey === undefined || apiKey === "") {
    return missingKeyError();
  }
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined) {
      payload[key] = value;
    }
  }
  const response = await fetch(`${shulstackSiteUrl()}/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const responseBody: unknown = await response.json().catch(() => null);
  if (response.status === 403) {
    return {
      error:
        "The agent's API key is read-only. To let Sruly make updates, create a Read & write key on the Developer → API keys page and set it as SHULSTACK_AGENT_API_KEY.",
      details: responseBody,
    };
  }
  if (!response.ok) {
    return { error: `ShulStack API responded ${response.status}`, details: responseBody };
  }
  return responseBody;
}
