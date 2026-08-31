import { defineTool } from "eve/tools";
import { z } from "zod";

import { shulstackGet } from "#lib/shulstack.js";

export default defineTool({
  description:
    "Fundraising campaigns with their rollups: pledge counts, open pipeline count, committed total, and money raised (minor units), plus goals and status.",
  inputSchema: z.object({}),
  async execute() {
    return await shulstackGet("/campaigns");
  },
});
