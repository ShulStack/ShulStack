import { describe, expect, test } from "vitest";

import { csvToRecords, normalizeHeader, parseCsv } from "./csv";

describe("parseCsv", () => {
  test("parses plain rows", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  test("handles quoted fields with commas, quotes, and newlines", () => {
    expect(parseCsv('name,memo\n"Cohen, David","He said ""hi""\nsecond line"')).toEqual([
      ["name", "memo"],
      ["Cohen, David", 'He said "hi"\nsecond line'],
    ]);
  });

  test("handles CRLF and trailing newline", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  test("keeps empty cells positional", () => {
    expect(parseCsv("a,,c")).toEqual([["a", "", "c"]]);
  });
});

describe("normalizeHeader", () => {
  test("snake_cases arbitrary headers", () => {
    expect(normalizeHeader("Date Joined")).toBe("date_joined");
    expect(normalizeHeader("  Billing Mail-Label ")).toBe("billing_mail_label");
    expect(normalizeHeader("DOB (Hebrew)")).toBe("dob_hebrew");
  });
});

describe("csvToRecords", () => {
  test("keys rows by normalized headers and drops empty cells", () => {
    const records = csvToRecords("First Name,Last Name,Email\nDavid,Cohen,\n,Levi,s@x.com");
    expect(records).toEqual([
      { first_name: "David", last_name: "Cohen" },
      { last_name: "Levi", email: "s@x.com" },
    ]);
  });
});
