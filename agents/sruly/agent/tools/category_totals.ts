import { defineTool } from "eve/tools";
import { z } from "zod";

import { shulstackGet } from "#lib/shulstack.js";

export default defineTool({
  description:
    "Totals per ledger category (dues, donations, campaign names, …) over an optional date range: how much was charged, paid, and credited in each. Amounts are minor units. Use for questions like 'how much came in as dues this year'.",
  inputSchema: z.object({
    from: z.string().optional().describe("Earliest date, YYYY-MM-DD"),
    to: z.string().optional().describe("Latest date, YYYY-MM-DD"),
  }),
  async execute(input) {
    return await shulstackGet("/analytics/categories", { from: input.from, to: input.to });
  },
});
