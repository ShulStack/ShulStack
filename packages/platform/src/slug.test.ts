import { describe, expect, test } from "vitest";

import { isValidSlug, slugify } from "./slug";

describe("isValidSlug", () => {
  test("accepts lowercase alphanumerics and hyphens", () => {
    expect(isValidSlug("beth-shalom")).toBe(true);
    expect(isValidSlug("cbs613")).toBe(true);
    expect(isValidSlug("a")).toBe(true);
  });

  test("rejects invalid shapes", () => {
    expect(isValidSlug("")).toBe(false);
    expect(isValidSlug("Beth-Shalom")).toBe(false);
    expect(isValidSlug("-leading")).toBe(false);
    expect(isValidSlug("trailing-")).toBe(false);
    expect(isValidSlug("has space")).toBe(false);
    expect(isValidSlug("a".repeat(65))).toBe(false);
  });
});

describe("slugify", () => {
  test("converts display names", () => {
    expect(slugify("Congregation Beth Shalom")).toBe("congregation-beth-shalom");
    expect(slugify("  B'nai   Israel!  ")).toBe("b-nai-israel");
    expect(slugify("Café Torah")).toBe("cafe-torah");
  });

  test("output is always a valid slug (or empty)", () => {
    for (const input of ["Congregation Beth Shalom", "B'nai Israel", "--x--", "שלום"]) {
      const slug = slugify(input);
      expect(slug === "" || isValidSlug(slug)).toBe(true);
    }
  });
});
