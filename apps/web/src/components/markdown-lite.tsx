import type { InlineSpan } from "../lib/markdown";
import { renderMarkdownLite } from "../lib/markdown";

function Spans({ spans }: { spans: InlineSpan[] }) {
  return (
    <>
      {spans.map((span, index) => {
        const key = index;
        switch (span.kind) {
          case "strong":
            return <strong key={key}>{span.text}</strong>;
          case "code":
            return (
              <code className="code-inline" key={key}>
                {span.text}
              </code>
            );
          default:
            return <span key={key}>{span.text}</span>;
        }
      })}
    </>
  );
}

/** Renders the markdown-lite subset (headings, lists, tables, bold/code)
 * as React elements — parsed text only, no HTML pass-through. */
export function MarkdownLite({ text }: { text: string }) {
  return (
    <>
      {renderMarkdownLite(text).map((block, index) => {
        const key = index;
        switch (block.kind) {
          case "h2":
            return (
              <h2 key={key}>
                <Spans spans={block.spans} />
              </h2>
            );
          case "h3":
            return (
              <h3 key={key}>
                <Spans spans={block.spans} />
              </h3>
            );
          case "ul":
          case "ol": {
            const items = block.items.map((item, itemIndex) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: items have no ids
              <li key={itemIndex}>
                <Spans spans={item} />
              </li>
            ));
            return block.kind === "ul" ? <ul key={key}>{items}</ul> : <ol key={key}>{items}</ol>;
          }
          case "table":
            return (
              <div className="markdown-table" key={key}>
                <table className="data-table">
                  <thead>
                    <tr>
                      {block.header.map((cell, cellIndex) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: cells have no ids
                        <th key={cellIndex}>
                          <Spans spans={cell} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: rows have no ids
                      <tr key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          // biome-ignore lint/suspicious/noArrayIndexKey: cells have no ids
                          <td key={cellIndex}>
                            <Spans spans={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return (
              <p key={key}>
                <Spans spans={block.spans} />
              </p>
            );
        }
      })}
    </>
  );
}
