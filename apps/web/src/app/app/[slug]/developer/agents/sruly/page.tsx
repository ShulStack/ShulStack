"use client";

import { EmptyState, PageHeader } from "@shulstack/ui";
import Link from "next/link";
import { useParams } from "next/navigation";

import { SrulyChat } from "../../../../../../components/sruly-chat";
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
        description="Ask about households, people, balances, giving analytics, and the pledge pipeline. Sruly only reads — he can't change records."
        title="Sruly"
      />
      <SrulyChat />
    </>
  );
}
