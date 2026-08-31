import { describe, expect, test } from "vitest";

import { apiBaseUrl, convexSiteUrl } from "./api-url";

describe("convexSiteUrl", () => {
  test("maps Convex Cloud deployment URLs to their site origin", () => {
    expect(convexSiteUrl("https://brave-cat-123.convex.cloud")).toBe(
      "https://brave-cat-123.convex.site",
    );
  });

  test("maps local and self-hosted backends one port up", () => {
    expect(convexSiteUrl("http://127.0.0.1:3212")).toBe("http://127.0.0.1:3213");
    expect(convexSiteUrl("http://localhost:3210")).toBe("http://localhost:3211");
  });

  test("apiBaseUrl appends the version prefix", () => {
    expect(apiBaseUrl("https://brave-cat-123.convex.cloud")).toBe(
      "https://brave-cat-123.convex.site/api/v1",
    );
  });
});
