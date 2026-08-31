import { defineTool } from "eve/tools";
import { z } from "zod";

import { shulstackGet } from "#lib/shulstack.js";

/**
 * Resolves a ShulStack dashboard path (the "Currently viewing" context sent
 * with each chat message) into the data behind that page, so "what am I
 * looking at?" questions work without the user re-describing the screen.
 */
export default defineTool({
  description:
    "Fetch the data behind a ShulStack dashboard page from its path (e.g. the user's current page from the conversation context). Supports the overview, household/person detail pages, households/people lists, and fundraising pages.",
  inputSchema: z.object({
    path: z.string().describe("The app path, e.g. /app/my-shul/households/abc123"),
  }),
  async execute(input) {
    const segments = input.path.split("?")[0]?.split("/").filter(Boolean) ?? [];
    // Expected shape: ["app", "<institution-slug>", ...rest]
    if (segments[0] !== "app" || segments.length < 2) {
      return { note: "Not a dashboard data page. I can read /app/<shul>/… pages." };
    }
    const rest = segments.slice(2);
    const [section, id, sub] = rest;

    if (section === undefined) {
      return { page: "overview", data: await shulstackGet("/summary") };
    }
    if (section === "households" && id !== undefined) {
      const [household, ledger] = await Promise.all([
        shulstackGet(`/households/${encodeURIComponent(id)}`),
        shulstackGet(`/households/${encodeURIComponent(id)}/ledger`, { limit: 25 }),
      ]);
      return { page: "household", data: household, recentLedger: ledger };
    }
    if (section === "households") {
      return { page: "households-list", data: await shulstackGet("/households", { limit: 50 }) };
    }
    if (section === "people" && id !== undefined) {
      return { page: "person", data: await shulstackGet(`/people/${encodeURIComponent(id)}`) };
    }
    if (section === "people") {
      return { page: "people-list", data: await shulstackGet("/people", { limit: 50 }) };
    }
    if (section === "fundraising" && id !== undefined && sub === undefined) {
      return {
        page: "campaign",
        data: await shulstackGet("/pledges", { campaignId: id }),
        campaigns: await shulstackGet("/campaigns"),
      };
    }
    if (section === "fundraising") {
      return {
        page: "fundraising",
        campaigns: await shulstackGet("/campaigns"),
        openPledges: await shulstackGet("/pledges", { open: "true" }),
      };
    }
    return {
      note: `I don't have a reader for "${section}" pages yet. I can read: the overview, households, people, and fundraising pages.`,
    };
  },
});
