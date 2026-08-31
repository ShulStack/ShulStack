import { defineTool } from "eve/tools";
import { z } from "zod";

import { shulstackSend } from "#lib/shulstack.js";

export default defineTool({
  description:
    "Correct a household's record: display name, type, membership dates, or active status. Only send the fields being changed.",
  inputSchema: z.object({
    householdId: z.string().describe("Household id from search_households"),
    displayName: z.string().optional(),
    householdType: z.string().optional(),
    billingAccountType: z.string().optional(),
    joinedAt: z.string().optional().describe("YYYY-MM-DD"),
    resignedAt: z.string().optional().describe("YYYY-MM-DD"),
    isActive: z.boolean().optional(),
  }),
  async execute(input) {
    const { householdId, ...fields } = input;
    return await shulstackSend("PATCH", `/households/${encodeURIComponent(householdId)}`, fields);
  },
});
