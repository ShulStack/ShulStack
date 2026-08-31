import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";

import { shulstackSend } from "#lib/shulstack.js";

export default defineTool({
  description:
    "Record a received gift against a pledge: posts the money to the household ledger, advances the pledge's received total and stage. Moves real money, so the user must approve it in chat before it runs.",
  inputSchema: z.object({
    pledgeId: z.string(),
    amountMinor: z.number().int().min(1).describe("Positive amount in minor units"),
    occurredAt: z.string().describe("YYYY-MM-DD"),
    method: z.string().optional().describe("e.g. check, credit card"),
    memo: z.string().optional(),
  }),
  approval: always(),
  async execute(input) {
    const { pledgeId, ...fields } = input;
    return await shulstackSend("POST", `/pledges/${encodeURIComponent(pledgeId)}/gifts`, fields);
  },
});
