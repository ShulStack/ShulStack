"use client";

import { useAuthToken } from "@convex-dev/auth/react";
import { Button, EmptyState, PageHeader } from "@shulstack/ui";
import { useEveAgent } from "eve/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";

import { useCanAdminister, useWorkspace } from "../../../../../../components/use-workspace";

export default function SrulyChatPage() {
  const workspace = useWorkspace();
  const canAdminister = useCanAdminister();
  const params = useParams<{ slug: string }>();
  if (workspace === undefined || workspace === null) {
    return null;
  }
  if (!canAdminister) {
    return <EmptyState description="Agents require the admin role." title="Admins only" />;
  }
  return (
    <>
      <PageHeader
        actions={
          <Link className="button secondary" href={`/app/${params.slug}/developer/agents`}>
            All agents
          </Link>
        }
        description="Ask about households, people, balances, and giving history. Sruly only reads — he can't change records."
        title="Sruly"
      />
      <SrulyChat />
    </>
  );
}

function SrulyChat() {
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
    <div className="chat-panel card">
      <div className="chat-messages">
        {agent.data.messages.length === 0 ? (
          <p className="muted">
            Try: “Who's in the Cohen household?” · “What's their balance?” · “When is Miriam's
            birthday?”
          </p>
        ) : (
          agent.data.messages.map((message) => (
            <div
              className={message.role === "user" ? "chat-bubble user" : "chat-bubble assistant"}
              key={message.id}
            >
              {message.parts.map((part, index) =>
                part.type === "text" ? (
                  // biome-ignore lint/suspicious/noArrayIndexKey: parts have no ids
                  <p key={index}>{part.text}</p>
                ) : null,
              )}
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
          void agent.send(message);
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
