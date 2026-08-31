import { defineTool } from "eve/tools";
import { z } from "zod";

import { shulstackGet } from "#lib/shulstack.js";

export default defineTool({
  description:
    "Search households (the synagogue's billing/family units) by name. Returns matching households with their ids; use get_household for members and balance.",
  inputSchema: z.object({
    query: z.string().describe("Name or fragment to search for, e.g. 'Cohen'"),
  }),
  async execute(input) {
    return await shulstackGet("/households", { search: input.query });
  },
});
