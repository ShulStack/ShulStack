"use client";

import { api } from "@shulstack/convex/_generated/api";
import type { Id } from "@shulstack/convex/_generated/dataModel";
import { Button, Card, PageHeader, Stat } from "@shulstack/ui";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

import { useCanAdminister, useWorkspace } from "../../../components/use-workspace";
import { errorMessage, formatTimestamp } from "../../../lib/format";

export default function OverviewPage() {
  const workspace = useWorkspace();

  if (workspace === undefined || workspace === null) {
    return null; // The layout renders loading/access states.
  }
  const institutionId = workspace.institution._id;
  return (
    <>
      <PageHeader
        description="What's happening across your community."
        title={workspace.institution.name}
      />
      <StatsRow institutionId={institutionId} />
      <RecentActivity institutionId={institutionId} />
    </>
  );
}

type InstitutionId = Id<"institutions">;

function StatsRow({ institutionId }: { institutionId: InstitutionId }) {
  const stats = useQuery(api.crm.dashboardStats, { institutionId });
  const canAdminister = useCanAdminister();

  return (
    <>
      <div className="stat-grid">
        <Stat label="Active households" value={stats?.activeHouseholds ?? "…"} />
        <Stat label="Active people" value={stats?.activePeople ?? "…"} />
      </div>
      {stats !== undefined &&
      stats.activeHouseholds === 0 &&
      stats.activePeople === 0 &&
      canAdminister ? (
        <SampleDataPrompt institutionId={institutionId} />
      ) : null}
    </>
  );
}

function SampleDataPrompt({ institutionId }: { institutionId: InstitutionId }) {
  const loadSampleData = useMutation(api.seed.loadSampleData);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <Card title="Fresh workspace">
      <p className="muted">
        Nothing here yet. Load a small sample dataset to explore the dashboard, or head to
        Households to start entering your community.
      </p>
      {error === null ? null : <p className="form-error">{error}</p>}
      <Button
        disabled={pending}
        onClick={() => {
          setPending(true);
          setError(null);
          loadSampleData({ institutionId })
            .catch((caught) => setError(errorMessage(caught)))
            .finally(() => setPending(false));
        }}
      >
        Load sample data
      </Button>
    </Card>
  );
}

function RecentActivity({ institutionId }: { institutionId: InstitutionId }) {
  const entries = useQuery(api.platform.listRecentAuditLogs, { institutionId });

  return (
    <Card title="Recent activity">
      {entries === undefined ? (
        <p className="muted">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="muted">No activity recorded yet.</p>
      ) : (
        <ul className="activity-list">
          {entries.map((entry) => (
            <li key={entry._id}>
              <span>
                <strong>{entry.actorEmail ?? "System"}</strong>{" "}
                <span className="muted">
                  {entry.action} {entry.entityType}
                </span>
              </span>
              <span className="muted">{formatTimestamp(entry._creationTime)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
