import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";

import { shulstackSend } from "#lib/shulstack.js";

export default defineTool({
  description:
    "Record money on a household's ledger: a charge (they owe more), a payment (money received), or a credit. This moves real balances, so the user must approve it in chat before it runs.",
  inputSchema: z.object({
    householdId: z.string(),
    entryType: z.enum(["charge", "payment", "credit"]),
    amountMinor: z.number().int().min(1).describe("Positive amount in minor units ($180 → 18000)"),
    occurredAt: z.string().describe("YYYY-MM-DD"),
    category: z.string().optional().describe("e.g. Membership, Donation, a campaign name"),
    method: z.string().optional().describe("e.g. check, credit card"),
    memo: z.string().optional(),
  }),
  approval: always(),
  async execute(input) {
    const { householdId, ...fields } = input;
    return await shulstackSend(
      "POST",
      `/households/${encodeURIComponent(householdId)}/ledger`,
      fields,
    );
  },
});
