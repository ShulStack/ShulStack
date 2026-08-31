"use client";

import { useAuthToken } from "@convex-dev/auth/react";
import { formatMoney } from "@shulstack/platform";
import { Button } from "@shulstack/ui";
import type { EveMessagePart } from "eve/react";
import { useEveAgent } from "eve/react";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";

import { MarkdownLite } from "./markdown-lite";
import { moneyRows } from "./money-rows";

/**
 * The Sruly chat surface, shared by the full page and the sidebar panel.
 * Every send carries ephemeral page context (the current path) so "this
 * household" questions resolve; tool results render as cards when the shape
 * is recognized (money-bar tables for analytics) and as collapsible JSON
 * otherwise.
 */
export function SrulyChat({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const token = useAuthToken();
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = token ?? null;
  const agent = useEveAgent({
    agent: "sruly",
    auth: { bearer: () => tokenRef.current ?? "" },
  });
  const [draft, setDraft] = useState("");
  const busy = agent.status === "submitted" || agent.status === "streaming";

  return (
    <div className={compact ? "chat-panel compact" : "chat-panel card"}>
      <div className="chat-messages">
        {agent.data.messages.length === 0 ? (
          <p className="muted">
            Try: “Who gave more than $10,000 all-time?” · “Top 10 donors this year” · “Who's in this
            household?”
          </p>
        ) : (
          agent.data.messages.map((message) => (
            <div
              className={message.role === "user" ? "chat-bubble user" : "chat-bubble assistant"}
              key={message.id}
            >
              {message.parts.map((part, index) => (
                <MessagePart
                  // biome-ignore lint/suspicious/noArrayIndexKey: parts have no ids
                  key={index}
                  onApproval={(requestId, optionId) =>
                    void agent.respond([{ requestId, optionId }])
                  }
                  part={part}
                  role={message.role}
                />
              ))}
            </div>
          ))
        )}
        {busy ? <p className="muted">Sruly is thinking…</p> : null}
        {agent.status === "error" ? (
          <p className="form-error">
            {agent.error instanceof Error ? agent.error.message : "Something went wrong."} If this
            persists, check the agent setup on the Agents page.
          </p>
        ) : null}
      </div>
      <form
        className="chat-input"
        onSubmit={(event) => {
          event.preventDefault();
          const message = draft.trim();
          if (message === "" || busy) {
            return;
          }
          setDraft("");
          void agent.send(message, {
            clientContext: [
              "Channel: ShulStack web chat — the UI renders your tool results as visual cards and tables automatically. Do not restate their rows in your reply.",
              `Currently viewing: ${pathname}`,
            ],
          });
        }}
      >
        <input
          aria-label="Message Sruly"
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask about your community…"
          value={draft}
        />
        <Button disabled={busy || draft.trim() === ""} type="submit">
          Send
        </Button>
      </form>
    </div>
  );
}

type ApprovalHandler = (requestId: string, optionId: "approve" | "cancel") => void;

function MessagePart({
  part,
  role,
  onApproval,
}: {
  part: EveMessagePart;
  role: "user" | "assistant";
  onApproval: ApprovalHandler;
}) {
  if (part.type === "text") {
    // Assistant replies arrive as markdown; user messages stay verbatim.
    return role === "assistant" ? <MarkdownLite text={part.text} /> : <p>{part.text}</p>;
  }
  if (part.type === "dynamic-tool") {
    return <ToolPart onApproval={onApproval} part={part} />;
  }
  return null;
}

type DynamicToolPart = Extract<EveMessagePart, { type: "dynamic-tool" }>;

function ToolPart({ part, onApproval }: { part: DynamicToolPart; onApproval: ApprovalHandler }) {
  const running =
    part.state === "input-streaming" ||
    part.state === "input-available" ||
    part.state === "approval-responded";
  return (
    <div className="tool-card">
      <p className="tool-chip">
        <span aria-hidden="true">⚙</span> {part.toolName.replace(/_/g, " ")}
        {running ? <span className="muted"> — running…</span> : null}
        {part.state === "approval-requested" ? (
          <span className="muted"> — needs your approval</span>
        ) : null}
      </p>
      {part.state === "approval-requested" ? (
        <div className="approval-request">
          <pre className="code-block">{JSON.stringify(part.input, null, 2)}</pre>
          <div className="copy-row">
            <Button onClick={() => onApproval(part.approval.id, "approve")}>Approve</Button>
            <Button onClick={() => onApproval(part.approval.id, "cancel")} variant="danger">
              Deny
            </Button>
          </div>
        </div>
      ) : null}
      {part.state === "output-error" ? (
        <p className="form-error">{part.errorText}</p>
      ) : part.state === "output-available" ? (
        <ToolOutput output={part.output} />
      ) : null}
      {part.state === "output-denied" ? (
        <p className="muted">Denied — nothing was changed.</p>
      ) : null}
    </div>
  );
}

const MAX_CARD_ROWS = 10;

function ToolOutput({ output }: { output: unknown }) {
  const rows = moneyRows(output);
  if (rows === null) {
    return (
      <details className="tool-json">
        <summary>Result</summary>
        <pre className="code-block">{JSON.stringify(output, null, 2)}</pre>
      </details>
    );
  }
  const max = Math.max(...rows.map((row) => Math.abs(row.valueMinor)), 1);
  const shown = rows.slice(0, MAX_CARD_ROWS);
  const summary =
    typeof output === "object" && output !== null && "summary" in output
      ? (output as { summary: Record<string, unknown> }).summary
      : undefined;
  return (
    <div className="money-rows">
      {shown.map((row) => (
        <div className="money-row" key={`${row.label}:${row.valueMinor}`}>
          <span className="money-row-label">
            {row.label}
            {row.detail === undefined ? null : <span className="muted"> — {row.detail}</span>}
          </span>
          <span className="money-row-bar">
            <span
              className="money-row-fill"
              style={{ width: `${Math.round((Math.abs(row.valueMinor) / max) * 100)}%` }}
            />
          </span>
          <span className="money-row-value">{formatMoney(row.valueMinor)}</span>
        </div>
      ))}
      {rows.length > shown.length ? (
        <p className="muted">…and {rows.length - shown.length} more</p>
      ) : null}
      {summary !== undefined &&
      typeof summary.matchedHouseholds === "number" &&
      typeof summary.totalMetricMinor === "number" ? (
        <p className="muted">
          {summary.matchedHouseholds} households · {formatMoney(summary.totalMetricMinor)} total
        </p>
      ) : null}
    </div>
  );
}
