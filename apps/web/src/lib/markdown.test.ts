import { describe, expect, test } from "vitest";

import { parseInline, renderMarkdownLite } from "./markdown";

const text = (value: string) => [{ kind: "text", text: value }];

describe("renderMarkdownLite", () => {
  test("parses headings, lists, and paragraphs", () => {
    const blocks = renderMarkdownLite(
      "## Welcome\n\nFirst paragraph\ncontinues here.\n\n- one\n- two\n\n### Details",
    );
    expect(blocks).toEqual([
      { kind: "h2", spans: text("Welcome") },
      { kind: "p", spans: text("First paragraph continues here.") },
      { kind: "ul", items: [text("one"), text("two")] },
      { kind: "h3", spans: text("Details") },
    ]);
  });

  test("ignores markup it does not know", () => {
    const blocks = renderMarkdownLite("<script>alert(1)</script>");
    expect(blocks).toEqual([{ kind: "p", spans: text("<script>alert(1)</script>") }]);
  });

  test("parses bold and code inline spans", () => {
    expect(parseInline("**Balance:** $250.00 via `check`")).toEqual([
      { kind: "strong", text: "Balance:" },
      { kind: "text", text: " $250.00 via " },
      { kind: "code", text: "check" },
    ]);
  });

  test("parses ordered lists", () => {
    const blocks = renderMarkdownLite("1. aleph\n2. bet");
    expect(blocks).toEqual([{ kind: "ol", items: [text("aleph"), text("bet")] }]);
  });

  test("parses GFM pipe tables", () => {
    const blocks = renderMarkdownLite(
      "| Name | Balance |\n|---|---|\n| Cohen | **$425.00** |\n| Levi | $0.00 |",
    );
    expect(blocks).toEqual([
      {
        kind: "table",
        header: [text("Name"), text("Balance")],
        rows: [
          [text("Cohen"), [{ kind: "strong", text: "$425.00" }]],
          [text("Levi"), text("$0.00")],
        ],
      },
    ]);
  });

  test("pipe lines without a divider fall back to a paragraph", () => {
    const blocks = renderMarkdownLite("| just | pipes |");
    expect(blocks).toEqual([{ kind: "p", spans: text("| just | pipes |") }]);
  });
});
