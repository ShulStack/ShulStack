import { defineTool } from "eve/tools";
import { z } from "zod";

import { shulstackSend } from "#lib/shulstack.js";

export default defineTool({
  description:
    "Create a new household (the billing/family unit). Check search_households first so an existing household is never duplicated.",
  inputSchema: z.object({
    displayName: z.string().describe("e.g. 'Cohen, David & Rachel'"),
    householdType: z.string().optional().describe("e.g. Family, Individual"),
    joinedAt: z.string().optional().describe("YYYY-MM-DD"),
  }),
  async execute(input) {
    return await shulstackSend("POST", "/households", input);
  },
});
