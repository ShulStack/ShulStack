/**
 * The HTTP API is served by Convex HTTP actions, which live on a sibling
 * origin of the deployment URL: `.convex.cloud` → `.convex.site` on Convex
 * Cloud, and one port up for local dev and the self-hosted Docker stack.
 */
export function convexSiteUrl(convexUrl: string): string {
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

export function apiBaseUrl(convexUrl: string): string {
  return `${convexSiteUrl(convexUrl)}/api/v1`;
}
