"use client";

import { Badge, EmptyState, PageHeader } from "@shulstack/ui";
import Link from "next/link";
import { useParams } from "next/navigation";

import { useCanAdminister, useWorkspace } from "../../../../../components/use-workspace";
import { apiBaseUrl } from "../../../../../lib/api-url";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL ?? "";

export default function McpPage() {
  const workspace = useWorkspace();
  const canAdminister = useCanAdminister();
  const params = useParams<{ slug: string }>();
  if (workspace === undefined || workspace === null) {
    return null;
  }
  if (!canAdminister) {
    return <EmptyState description="MCP settings require the admin role." title="Admins only" />;
  }

  return (
    <>
      <PageHeader
        description="Connect AI agents (Claude, and anything else that speaks MCP) directly to your community's data."
        title="MCP"
      />
      <section className="card">
        <div className="card-header">
          <h2>MCP server</h2>
          <Badge tone="warning">coming next</Badge>
        </div>
        <p className="muted">
          The MCP server is the next milestone on the{" "}
          <a href="https://github.com/ShulStack/ShulStack/blob/main/docs/roadmap.md">roadmap</a>. It
          will authenticate with the same API keys you manage here and expose membership and finance
          data as institution-scoped, read-only tools.
        </p>
        <p className="muted">
          Until then, everything an agent needs is already available over the{" "}
          <Link href={`/app/${params.slug}/developer/docs`}>HTTP API</Link> at{" "}
          <code className="code-inline">{apiBaseUrl(CONVEX_URL)}</code> — point a tool-using agent
          at the docs page and a key, and it can pull households, people, and transactions today.
        </p>
      </section>
    </>
  );
}
