import { describe, expect, test } from "vitest";

import { formatMoney, parseMoney } from "./money";

describe("formatMoney", () => {
  test("formats minor units as currency", () => {
    expect(formatMoney(123456)).toBe("$1,234.56");
    expect(formatMoney(0)).toBe("$0.00");
    expect(formatMoney(-1800)).toBe("-$18.00");
  });

  test("respects zero-decimal currencies", () => {
    expect(formatMoney(5000, "JPY")).toBe("¥5,000");
  });

  test("rejects non-integer amounts", () => {
    expect(() => formatMoney(12.5)).toThrow(RangeError);
    expect(() => formatMoney(Number.NaN)).toThrow(RangeError);
  });
});

describe("parseMoney", () => {
  test("parses plain and formatted amounts to minor units", () => {
    expect(parseMoney("1234.56")).toBe(123456);
    expect(parseMoney("1,234.56")).toBe(123456);
    expect(parseMoney("$425.00")).toBe(42500);
    expect(parseMoney("10")).toBe(1000);
    expect(parseMoney("10.5")).toBe(1050);
    expect(parseMoney("-18")).toBe(-1800);
  });

  test("zero-decimal currencies take whole amounts", () => {
    expect(parseMoney("5000", "JPY")).toBe(5000);
    expect(() => parseMoney("50.5", "JPY")).toThrow(/decimal/);
  });

  test("rejects malformed input", () => {
    expect(() => parseMoney("")).toThrow(RangeError);
    expect(() => parseMoney("abc")).toThrow(RangeError);
    expect(() => parseMoney("10.999")).toThrow(/decimal/);
    expect(() => parseMoney("1.2.3")).toThrow(RangeError);
  });

  test("parses negative amounts however the sign and symbol are ordered", () => {
    expect(parseMoney("-$18.00")).toBe(-1800);
    expect(parseMoney("$-18.00")).toBe(-1800);
    expect(parseMoney("- $18.00")).toBe(-1800);
    expect(() => parseMoney("1-2")).toThrow(RangeError);
  });

  test("three-decimal currencies parse and format at the right scale", () => {
    expect(parseMoney("1.250", "KWD")).toBe(1250);
    expect(() => parseMoney("1.2505", "KWD")).toThrow(/decimal/);
    expect(formatMoney(1250, "KWD", "en-US")).toMatch(/1\.250/);
  });

  test("round-trips with formatMoney", () => {
    expect(formatMoney(parseMoney("1,234.56"))).toBe("$1,234.56");
    expect(parseMoney(formatMoney(-1800))).toBe(-1800);
  });
});
