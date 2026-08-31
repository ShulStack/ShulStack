import { defineTool } from "eve/tools";
import { z } from "zod";

import { shulstackSend } from "#lib/shulstack.js";

export default defineTool({
  description:
    "Move a pledge through the pipeline, adjust its ask amount, or update its notes. Get the pledge id from list_pledges.",
  inputSchema: z.object({
    pledgeId: z.string(),
    stage: z
      .enum(["prospect", "cultivating", "asked", "pledged", "fulfilled", "declined"])
      .optional(),
    amountMinor: z.number().int().min(0).optional().describe("New ask amount in minor units"),
    notes: z.string().optional().describe("Replaces the pledge's notes"),
  }),
  async execute(input) {
    const { pledgeId, ...fields } = input;
    return await shulstackSend("PATCH", `/pledges/${encodeURIComponent(pledgeId)}`, fields);
  },
});
