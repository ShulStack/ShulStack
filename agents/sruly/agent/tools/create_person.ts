import { defineTool } from "eve/tools";
import { z } from "zod";

import { shulstackSend } from "#lib/shulstack.js";

export default defineTool({
  description:
    "Add a new person to the community records (e.g. a newborn or a missing family member). Use add_household_member afterwards to place them in their household.",
  inputSchema: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    gender: z.enum(["male", "female", "nonbinary", "unknown"]).optional(),
    dateOfBirth: z.string().optional().describe("YYYY-MM-DD"),
    hebrewGivenName: z.string().optional(),
  }),
  async execute(input) {
    return await shulstackSend("POST", "/people", input);
  },
});
