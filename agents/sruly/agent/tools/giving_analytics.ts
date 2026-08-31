import { defineTool } from "eve/tools";
import { z } from "zod";

import { shulstackGet } from "#lib/shulstack.js";

export default defineTool({
  description:
    "Community-wide giving analytics, aggregated per household (the ledger's unit of account). Answers threshold and ranking questions in one call: who paid/gave over an amount, top donors, totals for a date range or category. Returns rows sorted by the chosen metric plus a summary with the matched count and total. All amounts are integer minor units (cents).",
  inputSchema: z.object({
    metric: z
      .enum(["payments", "charges", "credits", "net"])
      .default("payments")
      .describe(
        "What to rank/filter by: payments (money received — use for 'spent/gave'), charges (billed), credits, or net (what they owe over the range)",
      ),
    from: z.string().optional().describe("Earliest date, YYYY-MM-DD"),
    to: z.string().optional().describe("Latest date, YYYY-MM-DD"),
    category: z
      .string()
      .optional()
      .describe("Only count entries in this category, e.g. 'Membership' or a campaign name"),
    minMinor: z
      .number()
      .int()
      .optional()
      .describe(
        "Only households whose metric is at least this, in minor units ($10,000 → 1000000)",
      ),
    maxMinor: z.number().int().optional().describe("Upper bound on the metric, minor units"),
    activeOnly: z.boolean().default(false).describe("Restrict to active households"),
    limit: z.number().int().min(1).max(200).default(50).describe("Max rows returned"),
  }),
  async execute(input) {
    return await shulstackGet("/analytics/households", {
      metric: input.metric,
      from: input.from,
      to: input.to,
      category: input.category,
      min: input.minMinor,
      max: input.maxMinor,
      active: input.activeOnly ? "true" : undefined,
      limit: input.limit,
    });
  },
});
