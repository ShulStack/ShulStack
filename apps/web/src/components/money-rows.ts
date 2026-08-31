export type MoneyRow = { label: string; valueMinor: number; detail?: string };

/**
 * Recognize the API's analytics/pledge/campaign response shapes ({ data: [...] })
 * as label + amount rows for the chat's money-bar cards. Returns null when the
 * shape doesn't fit, so callers fall back to raw JSON.
 */
export function moneyRows(output: unknown): MoneyRow[] | null {
  if (typeof output !== "object" || output === null || !("data" in output)) {
    return null;
  }
  const data = (output as { data: unknown }).data;
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }
  const rows: MoneyRow[] = [];
  for (const raw of data) {
    if (typeof raw !== "object" || raw === null) {
      return null;
    }
    const row = raw as Record<string, unknown>;
    const label = [row.displayName, row.householdName, row.category, row.name].find(
      (value): value is string => typeof value === "string",
    );
    const rollup =
      typeof row.rollup === "object" && row.rollup !== null
        ? (row.rollup as Record<string, unknown>)
        : undefined;
    const value = [row.metricMinor, row.paidMinor, rollup?.raisedMinor].find(
      (candidate): candidate is number => typeof candidate === "number",
    );
    if (label === undefined || value === undefined) {
      return null;
    }
    const stage = typeof row.stage === "string" ? row.stage : undefined;
    const campaign = typeof row.campaignName === "string" ? row.campaignName : undefined;
    rows.push({
      label,
      valueMinor: value,
      detail: [campaign, stage].filter((part) => part !== undefined).join(" · ") || undefined,
    });
  }
  return rows;
}
