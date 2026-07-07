import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";

import { errorMessage, formatIsoDate, todayIsoDate } from "./format";

describe("errorMessage", () => {
  test("unwraps ConvexError data for user display", () => {
    expect(errorMessage(new ConvexError("Household name is required."))).toBe(
      "Household name is required.",
    );
  });

  test("falls back to Error message, then a generic string", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("weird")).toBe("Something went wrong.");
  });
});

describe("formatIsoDate", () => {
  test("formats without timezone shifting", () => {
    expect(formatIsoDate("2026-07-01")).toBe("Jul 1, 2026");
    expect(formatIsoDate("2026-12-31")).toBe("Dec 31, 2026");
  });

  test("passes through malformed values", () => {
    expect(formatIsoDate("not-a-date")).toBe("not-a-date");
  });
});

describe("todayIsoDate", () => {
  test("produces an ISO calendar date", () => {
    expect(todayIsoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
