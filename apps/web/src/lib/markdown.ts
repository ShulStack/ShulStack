export type InlineSpan = { kind: "text" | "strong" | "code"; text: string };

export type RenderedBlock =
  | { kind: "h2" | "h3" | "p"; spans: InlineSpan[] }
  | { kind: "ul" | "ol"; items: InlineSpan[][] }
  | { kind: "table"; header: InlineSpan[][]; rows: InlineSpan[][][] };

/**
 * Deliberately tiny markdown subset shared by CMS page bodies and agent chat
 * replies: ## / ### headings, "- " and "1. " lists, GFM pipe tables,
 * paragraphs, and **bold** / `code` inline spans. Everything is parsed to
 * plain text spans and rendered as React elements — no HTML ever.
 */
export function renderMarkdownLite(body: string): RenderedBlock[] {
  const blocks: RenderedBlock[] = [];
  let paragraph: string[] = [];
  let list: InlineSpan[][] = [];
  let orderedList: InlineSpan[][] = [];
  let tableLines: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "p", spans: parseInline(paragraph.join(" ")) });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length > 0) {
      blocks.push({ kind: "ul", items: list });
      list = [];
    }
    if (orderedList.length > 0) {
      blocks.push({ kind: "ol", items: orderedList });
      orderedList = [];
    }
  };
  const flushTable = () => {
    if (tableLines.length === 0) {
      return;
    }
    const parsed = parseTable(tableLines);
    if (parsed !== null) {
      blocks.push(parsed);
    } else {
      // Not a real table after all: treat the lines as a paragraph.
      blocks.push({ kind: "p", spans: parseInline(tableLines.join(" ")) });
    }
    tableLines = [];
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushTable();
  };

  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("|") && line.endsWith("|") && line.length > 1) {
      flushParagraph();
      flushList();
      tableLines.push(line);
      continue;
    }
    flushTable();
    if (line === "") {
      flushAll();
    } else if (line.startsWith("### ")) {
      flushAll();
      blocks.push({ kind: "h3", spans: parseInline(line.slice(4)) });
    } else if (line.startsWith("## ")) {
      flushAll();
      blocks.push({ kind: "h2", spans: parseInline(line.slice(3)) });
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      flushParagraph();
      if (orderedList.length > 0) {
        flushList();
      }
      list.push(parseInline(line.slice(2)));
    } else if (/^\d+[.)] /.test(line)) {
      flushParagraph();
      if (list.length > 0) {
        flushList();
      }
      orderedList.push(parseInline(line.replace(/^\d+[.)] /, "")));
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushAll();
  return blocks;
}

/** Split a paragraph into text / **bold** / `code` spans. */
export function parseInline(text: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  let remaining = text;
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`/;
  while (remaining !== "") {
    const match = pattern.exec(remaining);
    if (match === null || match.index === undefined) {
      spans.push({ kind: "text", text: remaining });
      break;
    }
    if (match.index > 0) {
      spans.push({ kind: "text", text: remaining.slice(0, match.index) });
    }
    if (match[1] !== undefined) {
      spans.push({ kind: "strong", text: match[1] });
    } else if (match[2] !== undefined) {
      spans.push({ kind: "code", text: match[2] });
    }
    remaining = remaining.slice(match.index + match[0].length);
  }
  return spans.length === 0 ? [{ kind: "text", text: "" }] : spans;
}

const TABLE_DIVIDER = /^\|(\s*:?-+:?\s*\|)+$/;

function splitRow(line: string): InlineSpan[][] {
  return line
    .slice(1, -1)
    .split("|")
    .map((cell) => parseInline(cell.trim()));
}

function parseTable(lines: string[]): Extract<RenderedBlock, { kind: "table" }> | null {
  if (lines.length < 2 || lines[1] === undefined || !TABLE_DIVIDER.test(lines[1])) {
    return null;
  }
  const header = splitRow(lines[0] ?? "");
  const rows = lines.slice(2).map(splitRow);
  return { kind: "table", header, rows };
}
