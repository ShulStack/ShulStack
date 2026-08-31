import { defineTool } from "eve/tools";
import { z } from "zod";

import { shulstackGet } from "#lib/shulstack.js";

export default defineTool({
  description:
    "Community-wide snapshot: active household and people counts, and total outstanding vs credit balances in minor units.",
  inputSchema: z.object({}),
  async execute() {
    return await shulstackGet("/summary");
  },
});
