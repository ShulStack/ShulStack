import { defineTool } from "eve/tools";
import { z } from "zod";

import { shulstackGet } from "#lib/shulstack.js";

export default defineTool({
  description:
    "Pledges in the fundraising pipeline, joined to household/person/campaign names, with stage, committed amount, and amount received (minor units). Filter by campaign, stage, or open-only (prospect → pledged).",
  inputSchema: z.object({
    campaignId: z.string().optional().describe("Restrict to one campaign (id from list_campaigns)"),
    stage: z
      .enum(["prospect", "cultivating", "asked", "pledged", "fulfilled", "declined"])
      .optional(),
    openOnly: z.boolean().default(false).describe("Only stages still being worked"),
  }),
  async execute(input) {
    return await shulstackGet("/pledges", {
      campaignId: input.campaignId,
      stage: input.stage,
      open: input.openOnly ? "true" : undefined,
    });
  },
});
