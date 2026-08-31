import { defineTool } from "eve/tools";
import { z } from "zod";

import { shulstackSend } from "#lib/shulstack.js";

export default defineTool({
  description:
    "Correct or complete a person's record: names (English and Hebrew), birth dates, gender, marital status, and flags. Only send the fields being changed. Confirm which person with the user first when the match was ambiguous.",
  inputSchema: z.object({
    personId: z.string().describe("Person id from search_people or a household's member list"),
    firstName: z.string().optional(),
    middleName: z.string().optional(),
    lastName: z.string().optional(),
    nickname: z.string().optional(),
    title: z.string().optional(),
    suffix: z.string().optional(),
    gender: z.enum(["male", "female", "nonbinary", "unknown"]).optional(),
    maritalStatus: z.string().optional(),
    hebrewGivenName: z.string().optional(),
    hebrewFatherName: z.string().optional(),
    hebrewMotherName: z.string().optional(),
    hebrewFamilyName: z.string().optional(),
    dateOfBirth: z.string().optional().describe("YYYY-MM-DD"),
    hebrewBirthDate: z.string().optional(),
    honoraryMember: z.boolean().optional(),
    eligibleForAliyah: z.boolean().optional(),
    isDeceased: z.boolean().optional(),
    isActive: z.boolean().optional(),
  }),
  async execute(input) {
    const { personId, ...fields } = input;
    return await shulstackSend("PATCH", `/people/${encodeURIComponent(personId)}`, fields);
  },
});
