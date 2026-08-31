import { describe, expect, test } from "vitest";

import {
  mapAccountsCsv,
  mapPeopleCsv,
  mapTransactionsCsv,
  parseImportDate,
  parseImportGender,
  parseImportMoney,
  parseImportRole,
} from "./shulcloud";

const ACCOUNTS_CSV = `ID,Name,Account Type,Date Joined,Balance,Address,City,State,Zip,Email,Print Family Card
101,"Cohen, David & Rachel",Family,9/15/2019,"$425.00","12 Elm St",Denver,CO,80203,cohens@example.com,Yes
102,Goldberg Miriam,Individual,6/22/2015,"(18.00)",,,,,,No
103,,Family,,,,,,,,`;

const PEOPLE_CSV = `ID,Account ID,First Name,Last Name,Gender,Relationship,DOB,Hebrew Name,Is Primary Contact,Email,Mobile,Deceased
201,101,David,Cohen,M,Head,3/1/1980,דוד,Yes,david@example.com,555-1234,No
202,101,Rachel,Cohen,F,Spouse,1981-07-04,,No,,,
203,999,Orphan,Row,,Child,,,,,,
204,101,,,,,,,,,,`;

describe("mapAccountsCsv", () => {
  test("maps well-formed rows and reports bad ones", () => {
    const { accounts, issues } = mapAccountsCsv(ACCOUNTS_CSV);
    expect(accounts).toHaveLength(2);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toMatch(/no name/);

    const cohen = accounts[0];
    expect(cohen).toMatchObject({
      externalId: "101",
      displayName: "Cohen, David & Rachel",
      householdType: "Family",
      joinedAt: "2019-09-15",
      openingBalanceMinor: 42500,
      email: "cohens@example.com",
      isActive: true,
    });
    expect(cohen?.address).toMatchObject({ address1: "12 Elm St", city: "Denver", state: "CO" });
    // Unmapped columns land in metadata, not on the record.
    expect(cohen?.metadata).toEqual({ print_family_card: "Yes" });

    // Negative balances in parentheses.
    expect(accounts[1]?.openingBalanceMinor).toBe(-1800);
    expect(accounts[1]?.address).toBeUndefined();
  });
});

describe("activity defaults", () => {
  test("a resignation date means inactive unless the export says otherwise", () => {
    const csv = `ID,Name,Date Resigned,Active
301,Resigned Household,6/30/2024,
302,Active Household,,
303,Explicitly Active,1/1/2020,Yes`;
    const { accounts } = mapAccountsCsv(csv);
    expect(accounts.map((a) => [a.externalId, a.isActive])).toEqual([
      ["301", false],
      ["302", true],
      ["303", true],
    ]);
  });

  test("deceased people default to inactive", () => {
    const csv = `ID,First Name,Last Name,Deceased
401,Alte,Bubbe,Yes
402,Living,Person,No`;
    const { people } = mapPeopleCsv(csv);
    expect(people.map((p) => [p.externalId, p.isDeceased, p.isActive])).toEqual([
      ["401", true, false],
      ["402", false, true],
    ]);
  });

  test("a malformed file becomes a file-level issue, not a silent truncation", () => {
    const csv = 'ID,Name\n101,"Unclosed quote\n102,Lost Row';
    const { accounts, issues } = mapAccountsCsv(csv);
    expect(accounts).toHaveLength(0);
    expect(issues).toEqual([{ row: 1, message: expect.stringMatching(/[Uu]nterminated/) }]);
  });
});

describe("mapPeopleCsv", () => {
  test("maps people with roles, contact points, and account links", () => {
    const { people, issues } = mapPeopleCsv(PEOPLE_CSV);
    expect(people).toHaveLength(3);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toMatch(/no name columns/);

    const david = people[0];
    expect(david).toMatchObject({
      externalId: "201",
      accountExternalId: "101",
      firstName: "David",
      lastName: "Cohen",
      gender: "male",
      memberRole: "head",
      dateOfBirth: "1980-03-01",
      hebrewGivenName: "דוד",
      isPrimaryContact: true,
      isDeceased: false,
    });
    expect(david?.emails).toEqual(["david@example.com"]);
    expect(david?.phones).toEqual([{ label: "mobile", value: "555-1234" }]);

    expect(people[1]).toMatchObject({ gender: "female", memberRole: "spouse" });
    expect(people[1]?.dateOfBirth).toBe("1981-07-04");
    // Row with an unknown account still maps; linking is the backend's concern.
    expect(people[2]?.accountExternalId).toBe("999");
  });
});

// Mirrors the real export's header set (BOM included); values are synthetic.
const TRANSACTIONS_CSV = `﻿Date,ID,Account,Email,"Member Since",Type,"Txn Ref",Notes,Charge,Payment,Status,"Is Closed?","Amount Open","Account ID","Payer ID",Payer,"Reversal Type","Internal ID"
2026-01-15,C101,"Cohen, David & Rachel",cohens@example.com,2019-09-15,Membership,,Annual dues,1800.00,,Closed,Y,0.00,101,,,,900000001
2026-02-01,P201,"Cohen, David & Rachel",cohens@example.com,2019-09-15,Credit Card,ch_testref123,,,1000.00,Closed,Y,0.00,101,,,,900000002
2026-03-01,C102,"Cohen, David & Rachel",cohens@example.com,2019-09-15,Membership,,Board discount,-300.00,,Closed,Y,0.00,101,,,Adjustment,900000003
2026-03-15,P202,"Cohen, David & Rachel",cohens@example.com,2019-09-15,Check,,,,-250.00,Closed,Y,250.00,101,,,Bounce,900000004
2026-04-01,C103,Goldberg Miriam,,2015-06-22,Donation,,,0.00,,Closed,Y,0.00,102,,,,900000005
2026-05-01,C104,Goldberg Miriam,,2015-06-22,Donation,,,18.00,,Closed,Y,0.00,,,,,900000006`;

describe("mapTransactionsCsv", () => {
  test("maps charges and payments, with Type as category or method", () => {
    const { transactions, issues } = mapTransactionsCsv(TRANSACTIONS_CSV);
    expect(transactions).toHaveLength(4);
    expect(issues).toHaveLength(2);

    expect(transactions[0]).toMatchObject({
      externalId: "C101",
      accountExternalId: "101",
      entryType: "charge",
      amountMinor: 180_000,
      occurredAt: "2026-01-15",
      category: "Membership",
      memo: "Annual dues",
    });
    expect(transactions[0]?.method).toBeUndefined();

    expect(transactions[1]).toMatchObject({
      externalId: "P201",
      entryType: "payment",
      amountMinor: 100_000,
      method: "Credit Card",
    });
    expect(transactions[1]?.category).toBeUndefined();
  });

  test("negative charges become credits; negative payments become reversal charges", () => {
    const { transactions } = mapTransactionsCsv(TRANSACTIONS_CSV);
    expect(transactions[2]).toMatchObject({
      externalId: "C102",
      entryType: "credit",
      amountMinor: 30_000,
      category: "Membership",
      memo: "Adjustment: Board discount",
    });
    expect(transactions[3]).toMatchObject({
      externalId: "P202",
      entryType: "charge",
      amountMinor: 25_000,
      category: "Payment reversal",
      method: "Check",
      memo: "Bounce",
    });
  });

  test("zero amounts and missing account ids come back as issues", () => {
    const { issues } = mapTransactionsCsv(TRANSACTIONS_CSV);
    expect(issues.map((issue) => issue.message)).toEqual([
      expect.stringMatching(/C103.*zero amount/),
      expect.stringMatching(/C104.*no account id/),
    ]);
  });

  test("keeps bookkeeping columns in metadata but drops account-level personal fields", () => {
    const { transactions } = mapTransactionsCsv(TRANSACTIONS_CSV);
    const payment = transactions[1];
    expect(payment?.metadata).toMatchObject({
      txn_ref: "ch_testref123",
      status: "Closed",
      is_closed: "Y",
      internal_id: "900000002",
    });
    for (const dropped of ["account", "email", "member_since", "payer"]) {
      expect(payment?.metadata[dropped]).toBeUndefined();
    }
  });

  test("a malformed file becomes a file-level issue", () => {
    const { transactions, issues } = mapTransactionsCsv('ID,Notes\nC1,"unclosed');
    expect(transactions).toHaveLength(0);
    expect(issues).toEqual([{ row: 1, message: expect.stringMatching(/[Uu]nterminated/) }]);
  });
});

describe("field helpers", () => {
  test("parseImportDate handles US and ISO dates", () => {
    expect(parseImportDate("3/29/2026")).toBe("2026-03-29");
    expect(parseImportDate("03/29/26")).toBe("2026-03-29");
    expect(parseImportDate("2026-3-9")).toBe("2026-03-09");
    expect(parseImportDate("March 29")).toBeUndefined();
    expect(parseImportDate(undefined)).toBeUndefined();
  });

  test("parseImportMoney handles symbols, commas, and parentheses", () => {
    expect(parseImportMoney("$1,234.56")).toBe(123456);
    expect(parseImportMoney("(45.00)")).toBe(-4500);
    expect(parseImportMoney("not money")).toBeUndefined();
  });

  test("parseImportGender and parseImportRole normalize values", () => {
    expect(parseImportGender("M")).toBe("male");
    expect(parseImportGender("Female")).toBe("female");
    expect(parseImportGender("?")).toBe("unknown");
    expect(parseImportRole("Head of Household")).toBe("head");
    expect(parseImportRole("Daughter")).toBe("child");
    expect(parseImportRole("Cousin")).toBe("other");
  });
});
