import { describe, expect, test } from "vitest";

import { buildPersonDisplayName } from "./names";

describe("buildPersonDisplayName", () => {
  test("uses first + last name", () => {
    expect(buildPersonDisplayName({ firstName: "David", lastName: "Cohen" })).toBe("David Cohen");
  });

  test("prefers nickname over first name", () => {
    expect(
      buildPersonDisplayName({ firstName: "David", nickname: "Dudu", lastName: "Cohen" }),
    ).toBe("Dudu Cohen");
  });

  test("handles partial names", () => {
    expect(buildPersonDisplayName({ firstName: "Miriam" })).toBe("Miriam");
    expect(buildPersonDisplayName({ lastName: "Goldberg" })).toBe("Goldberg");
  });

  test("falls back to mail name, then a placeholder", () => {
    expect(buildPersonDisplayName({ mailName: "The Cohen Family" })).toBe("The Cohen Family");
    expect(buildPersonDisplayName({})).toBe("Unnamed person");
    expect(buildPersonDisplayName({ firstName: "  ", lastName: "" })).toBe("Unnamed person");
  });

  test("trims whitespace", () => {
    expect(buildPersonDisplayName({ firstName: " David ", lastName: " Cohen " })).toBe(
      "David Cohen",
    );
  });
});
