import { describe, expect, test } from "vitest";

import { moneyRows } from "./money-rows";

describe("moneyRows", () => {
  test("maps giving-analytics rows to label + metric", () => {
    const rows = moneyRows({
      data: [
        { displayName: "Goldberg Family", metricMinor: 1_500_000, paidMinor: 1_500_000 },
        { displayName: "Cohen Family", metricMinor: 1_200_000, paidMinor: 1_200_000 },
      ],
      summary: { matchedHouseholds: 2 },
    });
    expect(rows).toEqual([
      { label: "Goldberg Family", valueMinor: 1_500_000, detail: undefined },
      { label: "Cohen Family", valueMinor: 1_200_000, detail: undefined },
    ]);
  });

  test("maps pledges with campaign and stage detail", () => {
    const rows = moneyRows({
      data: [
        {
          householdName: "Cohen Family",
          campaignName: "Building Campaign",
          stage: "pledged",
          amountMinor: 500_000,
          paidMinor: 200_000,
        },
      ],
    });
    expect(rows).toEqual([
      {
        label: "Cohen Family",
        valueMinor: 200_000,
        detail: "Building Campaign · pledged",
      },
    ]);
  });

  test("maps campaigns via their rollup", () => {
    const rows = moneyRows({
      data: [{ name: "Building Campaign", rollup: { raisedMinor: 200_000 } }],
    });
    expect(rows).toEqual([{ label: "Building Campaign", valueMinor: 200_000, detail: undefined }]);
  });

  test("rejects shapes that don't fit instead of guessing", () => {
    expect(moneyRows({ data: [] })).toBeNull();
    expect(moneyRows({ data: [{ id: "x" }] })).toBeNull();
    expect(moneyRows({ note: "hi" })).toBeNull();
    expect(moneyRows("text")).toBeNull();
  });
});
