import { defineTool } from "eve/tools";
import { z } from "zod";

import { shulstackGet } from "#lib/shulstack.js";

export default defineTool({
  description:
    "Fetch one household by id: its details, every member (with roles and person ids), and the billing profile with the live balance in minor units (positive = owes).",
  inputSchema: z.object({
    householdId: z.string().describe("Household id from search_households"),
  }),
  async execute(input) {
    return await shulstackGet(`/households/${encodeURIComponent(input.householdId)}`);
  },
});
