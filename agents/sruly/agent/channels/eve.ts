import {
  type AuthFn,
  extractBearerToken,
  localDev,
  vercelOidc,
  verifyOidc,
} from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";

import { shulstackSiteUrl } from "#lib/shulstack.js";

/**
 * Accepts a ShulStack user's Convex Auth JWT (the in-app chat sends it).
 * Convex Auth is an OIDC issuer on the deployment's site URL — the same
 * origin the ShulStack API lives on. Resolved lazily so builds without
 * deployment env don't fail; without env this entry just skips.
 */
const shulstackUserAuth: AuthFn<Request> = async (request) => {
  let issuer: string;
  try {
    issuer = shulstackSiteUrl();
  } catch {
    return null;
  }
  const token = extractBearerToken(request.headers.get("authorization"));
  const result = await verifyOidc(token, { issuer, audiences: ["convex"] });
  return result.ok ? result.sessionAuth : null;
};

/**
 * Route auth fails closed: a ShulStack user JWT, a Vercel OIDC token
 * (subagents, eve tooling), or a local `eve dev` server — anything else is
 * rejected in production.
 */
export default eveChannel({
  auth: [shulstackUserAuth, vercelOidc(), localDev()],
});
