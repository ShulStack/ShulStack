import { defineTool } from "eve/tools";
import { z } from "zod";

import { shulstackGet } from "#lib/shulstack.js";

export default defineTool({
  description:
    "A household's financial history: charges, payments, credits, and gifts, newest first. Amounts are minor units; balanceDeltaMinor is the signed effect on what they owe.",
  inputSchema: z.object({
    householdId: z.string().describe("Household id"),
    from: z.string().optional().describe("Earliest date, YYYY-MM-DD"),
    to: z.string().optional().describe("Latest date, YYYY-MM-DD"),
    limit: z.number().int().min(1).max(200).optional().describe("Max entries (default 50)"),
  }),
  async execute(input) {
    return await shulstackGet(`/households/${encodeURIComponent(input.householdId)}/ledger`, {
      from: input.from,
      to: input.to,
      limit: input.limit,
    });
  },
});
