import { describe, expect, test } from "vitest";

import { renderMarkdownLite } from "./markdown";

describe("renderMarkdownLite", () => {
  test("splits headings, paragraphs, and lists", () => {
    const body = [
      "## Services",
      "Friday nights at 6pm.",
      "Everyone is welcome.",
      "",
      "### Weekday minyan",
      "- Sunday 9am",
      "- Monday 7am",
      "",
      "See you there.",
    ].join("\n");
    expect(renderMarkdownLite(body)).toEqual([
      { kind: "h2", text: "Services" },
      { kind: "p", text: "Friday nights at 6pm. Everyone is welcome." },
      { kind: "h3", text: "Weekday minyan" },
      { kind: "ul", items: ["Sunday 9am", "Monday 7am"] },
      { kind: "p", text: "See you there." },
    ]);
  });

  test("plain text becomes a single paragraph", () => {
    expect(renderMarkdownLite("Hello world")).toEqual([{ kind: "p", text: "Hello world" }]);
    expect(renderMarkdownLite("")).toEqual([]);
  });
});
