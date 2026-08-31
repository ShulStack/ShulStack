/**
 * Server-side plain-text extraction from a rich-text document (TipTap/
 * ProseMirror JSON). Lists, search, and the API read the derived plain text;
 * only the editor consumes the document itself. Walks structure generically —
 * any node's `text` is collected, block boundaries become newlines — so new
 * marks/node types never break extraction.
 */
export function richTextToPlain(doc: unknown): string {
  const parts: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node !== "object" || node === null) {
      return;
    }
    const record = node as Record<string, unknown>;
    if (typeof record.text === "string") {
      parts.push(record.text);
    }
    if (Array.isArray(record.content)) {
      for (const child of record.content) {
        walk(child);
      }
      const type = record.type;
      if (typeof type === "string" && type !== "doc" && type !== "text") {
        parts.push("\n");
      }
    }
  };
  walk(doc);
  return parts
    .join("")
    .replace(/\n{2,}/g, "\n")
    .trim();
}
