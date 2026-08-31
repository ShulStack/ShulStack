import { defineTool } from "eve/tools";
import { z } from "zod";

import { shulstackSend } from "#lib/shulstack.js";

export default defineTool({
  description:
    "Link an existing person into a household with a role. Both ids must belong to this community.",
  inputSchema: z.object({
    householdId: z.string(),
    personId: z.string(),
    role: z.enum(["head", "spouse", "child", "dependent_adult", "other"]).optional(),
    isPrimaryContact: z.boolean().optional(),
    isBillingContact: z.boolean().optional(),
  }),
  async execute(input) {
    const { householdId, ...fields } = input;
    return await shulstackSend(
      "POST",
      `/households/${encodeURIComponent(householdId)}/members`,
      fields,
    );
  },
});
