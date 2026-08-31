import { defineTool } from "eve/tools";
import { z } from "zod";

import { shulstackGet } from "#lib/shulstack.js";

export default defineTool({
  description:
    "Search individual people by name. Returns matches with ids; use get_person for full details and household memberships.",
  inputSchema: z.object({
    query: z.string().describe("Name or fragment, e.g. 'Miriam'"),
  }),
  async execute(input) {
    return await shulstackGet("/people", { search: input.query });
  },
});
