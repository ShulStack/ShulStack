"use client";

import { Badge, EmptyState, PageHeader } from "@shulstack/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useCanAdminister, useWorkspace } from "../../../../../components/use-workspace";

type AgentStatus = "checking" | "running" | "disabled";

function useAgentStatus(agentName: string): AgentStatus {
  const [status, setStatus] = useState<AgentStatus>("checking");
  useEffect(() => {
    let cancelled = false;
    fetch(`/eve/agents/${agentName}/eve/v1/health`)
      .then((response) => {
        if (!cancelled) {
          setStatus(response.ok ? "running" : "disabled");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("disabled");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [agentName]);
  return status;
}

export default function AgentsPage() {
  const workspace = useWorkspace();
  const canAdminister = useCanAdminister();
  const params = useParams<{ slug: string }>();
  const sruly = useAgentStatus("sruly");
  if (workspace === undefined || workspace === null) {
    return null;
  }
  if (!canAdminister) {
    return <EmptyState description="Agents require the admin role." title="Admins only" />;
  }

  return (
    <>
      <PageHeader
        description="AI agents that ship inside your deployment — each narrowly scoped to one job, powered by your own API keys, billed to your own Vercel account."
        title="Agents"
      />
      <section className="card">
        <div className="card-header">
          <h2>Sruly — membership Q&amp;A</h2>
          {sruly === "checking" ? (
            <Badge tone="neutral">checking…</Badge>
          ) : sruly === "running" ? (
            <Badge tone="positive">running</Badge>
          ) : (
            <Badge tone="neutral">not enabled</Badge>
          )}
        </div>
        <p className="muted">
          Sruly answers staff questions about your community: who's in a household, birth dates,
          Hebrew names, balances, and giving history. Read-only by design — he can look things up,
          never change them.
        </p>
        {sruly === "running" ? (
          <p>
            <Link className="button" href={`/app/${params.slug}/developer/agents/sruly`}>
              Chat with Sruly
            </Link>
          </p>
        ) : (
          <>
            <h3>Enable Sruly</h3>
            <ol className="muted docs-list">
              <li>
                Create a <strong>read-only</strong> API key named “Sruly” on the{" "}
                <Link href={`/app/${params.slug}/developer/api-keys`}>API keys page</Link> and copy
                it.
              </li>
              <li>
                In your Vercel project settings, add two environment variables:{" "}
                <code className="code-inline">AGENTS_ENABLED=true</code> and{" "}
                <code className="code-inline">SHULSTACK_AGENT_API_KEY=ssk_…</code> (the key you just
                created).
              </li>
              <li>Redeploy. Sruly builds into your deployment and this page lights up.</li>
            </ol>
            <p className="muted">
              Model calls route through Vercel's AI Gateway on your account (free tier available,
              budgets supported). Full details, local development, and the Slack/WhatsApp roadmap:
              docs/agents.md in the repository.
            </p>
          </>
        )}
      </section>
      <section className="card">
        <div className="card-header">
          <h2>Fundraising agent</h2>
          <Badge tone="warning">planned</Badge>
        </div>
        <p className="muted">
          A second agent scoped to campaigns, pledges, and donor enrichment — same pattern, its own
          key. It lands as another entry in this list.
        </p>
      </section>
    </>
  );
}
