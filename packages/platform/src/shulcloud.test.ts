import { describe, expect, test } from "vitest";

import {
  mapAccountsCsv,
  mapPeopleCsv,
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
