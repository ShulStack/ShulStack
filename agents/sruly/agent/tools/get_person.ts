import { defineTool } from "eve/tools";
import { z } from "zod";

import { shulstackGet } from "#lib/shulstack.js";

export default defineTool({
  description:
    "Fetch one person by id: names (including Hebrew name fields), birth dates, status flags, and which households they belong to with what role.",
  inputSchema: z.object({
    personId: z.string().describe("Person id from search_people or a household's member list"),
  }),
  async execute(input) {
    return await shulstackGet(`/people/${encodeURIComponent(input.personId)}`);
  },
});
