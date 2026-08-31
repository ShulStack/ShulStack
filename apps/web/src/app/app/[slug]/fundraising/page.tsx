"use client";

import { api } from "@shulstack/convex/_generated/api";
import type { Id } from "@shulstack/convex/_generated/dataModel";
import {
  formatMoney,
  PLEDGE_STAGES,
  type PledgeStage,
  parseMoney,
  pledgeStageLabel,
} from "@shulstack/platform";
import { Button, Card, Field, PageHeader } from "@shulstack/ui";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { PledgeStageBadge } from "../../../../components/pledge-badges";
import { useCanAdminister, useWorkspace } from "../../../../components/use-workspace";
import { errorMessage } from "../../../../lib/format";

export default function FundraisingPage() {
  const workspace = useWorkspace();
  const canAdminister = useCanAdminister();
  if (workspace === undefined || workspace === null) {
    return null;
  }
  return (
    <>
      <PageHeader
        description="Campaigns, the pledge pipeline, and everything your community has committed."
        title="Fundraising"
      />
      {canAdminister ? <CreateCampaignForm institutionId={workspace.institution._id} /> : null}
      <CampaignsCard institutionId={workspace.institution._id} />
      <PledgeScreeningCard institutionId={workspace.institution._id} />
    </>
  );
}

function CreateCampaignForm({ institutionId }: { institutionId: Id<"institutions"> }) {
  const createCampaign = useMutation(api.fundraising.createCampaign);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Card>
      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          let goalMinor: number | undefined;
          try {
            goalMinor = goal.trim() === "" ? undefined : parseMoney(goal);
          } catch (caught) {
            setError(errorMessage(caught));
            return;
          }
          setPending(true);
          createCampaign({ institutionId, name, goalMinor })
            .then(() => {
              setName("");
              setGoal("");
            })
            .catch((caught) => setError(errorMessage(caught)))
            .finally(() => setPending(false));
        }}
      >
        <Field label="New campaign">
          {(id) => (
            <input
              id={id}
              onChange={(event) => setName(event.target.value)}
              placeholder="Building Campaign 5787"
              required
              value={name}
            />
          )}
        </Field>
        <Field hint="Optional" label="Goal">
          {(id) => (
            <input
              id={id}
              onChange={(event) => setGoal(event.target.value)}
              placeholder="1,000,000"
              value={goal}
            />
          )}
        </Field>
        <Button disabled={pending} type="submit">
          Create campaign
        </Button>
      </form>
      {error === null ? null : <p className="form-error">{error}</p>}
    </Card>
  );
}

function CampaignsCard({ institutionId }: { institutionId: Id<"institutions"> }) {
  const params = useParams<{ slug: string }>();
  const campaigns = useQuery(api.fundraising.listCampaigns, { institutionId });

  return (
    <Card title="Campaigns">
      {campaigns === undefined ? (
        <p className="muted">Loading…</p>
      ) : campaigns.length === 0 ? (
        <p className="muted">No campaigns yet.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Committed</th>
              <th>Received</th>
              <th>Goal</th>
              <th>Open pledges</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => (
              <tr key={campaign._id}>
                <td>
                  <Link href={`/app/${params.slug}/fundraising/${campaign._id}`}>
                    {campaign.name}
                  </Link>
                  {campaign.status === "archived" ? (
                    <span className="muted"> (archived)</span>
                  ) : null}
                </td>
                <td>{formatMoney(campaign.rollup.committedMinor)}</td>
                <td>{formatMoney(campaign.rollup.raisedMinor)}</td>
                <td>
                  {campaign.goalMinor === undefined ? (
                    <span className="muted">—</span>
                  ) : (
                    <GoalProgress
                      goalMinor={campaign.goalMinor}
                      raisedMinor={campaign.rollup.raisedMinor}
                    />
                  )}
                </td>
                <td>{campaign.rollup.openCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function GoalProgress({ goalMinor, raisedMinor }: { goalMinor: number; raisedMinor: number }) {
  const percent = goalMinor === 0 ? 0 : Math.min(100, Math.round((raisedMinor / goalMinor) * 100));
  return (
    <span className="goal-progress">
      <span className="goal-progress-track" role="presentation">
        <span className="goal-progress-fill" style={{ width: `${percent}%` }} />
      </span>
      <span className="muted">
        {percent}% of {formatMoney(goalMinor)}
      </span>
    </span>
  );
}

/** The screening table: every pledge in the institution, filterable. */
function PledgeScreeningCard({ institutionId }: { institutionId: Id<"institutions"> }) {
  const params = useParams<{ slug: string }>();
  const pledges = useQuery(api.fundraising.listPledges, { institutionId });
  const [stageFilter, setStageFilter] = useState<PledgeStage | "all" | "open">("open");
  const [search, setSearch] = useState("");

  const filtered = (pledges ?? []).filter((pledge) => {
    if (stageFilter === "open") {
      if (pledge.stage === "fulfilled" || pledge.stage === "declined") {
        return false;
      }
    } else if (stageFilter !== "all" && pledge.stage !== stageFilter) {
      return false;
    }
    if (search.trim() === "") {
      return true;
    }
    const needle = search.trim().toLowerCase();
    return [pledge.householdName, pledge.personName, pledge.campaignName, pledge.notes]
      .filter((value): value is string => value !== undefined)
      .some((value) => value.toLowerCase().includes(needle));
  });

  return (
    <Card title="Pledges">
      <div className="inline-form">
        <Field label="Stage">
          {(id) => (
            <select
              id={id}
              onChange={(event) => setStageFilter(event.target.value as typeof stageFilter)}
              value={stageFilter}
            >
              <option value="open">All open</option>
              <option value="all">Everything</option>
              {PLEDGE_STAGES.map((stage) => (
                <option key={stage.slug} value={stage.slug}>
                  {stage.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Filter">
          {(id) => (
            <input
              id={id}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Household, person, campaign, notes…"
              type="search"
              value={search}
            />
          )}
        </Field>
      </div>
      {pledges === undefined ? (
        <p className="muted">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="muted">Nothing matches.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Household</th>
              <th>Person</th>
              <th>Campaign</th>
              <th>Stage</th>
              <th>Pledged</th>
              <th>Received</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((pledge) => (
              <tr key={pledge.pledgeId}>
                <td>
                  <Link href={`/app/${params.slug}/households/${pledge.householdId}`}>
                    {pledge.householdName}
                  </Link>
                </td>
                <td>
                  {pledge.personId === undefined ? (
                    <span className="muted">—</span>
                  ) : (
                    <Link href={`/app/${params.slug}/people/${pledge.personId}`}>
                      {pledge.personName}
                    </Link>
                  )}
                </td>
                <td>
                  <Link href={`/app/${params.slug}/fundraising/${pledge.campaignId}`}>
                    {pledge.campaignName}
                  </Link>
                </td>
                <td>
                  <PledgeStageBadge stage={pledge.stage} />
                </td>
                <td>{pledge.amountMinor === 0 ? "—" : formatMoney(pledge.amountMinor)}</td>
                <td>{formatMoney(pledge.paidMinor)}</td>
                <td className="muted">{pledge.notes ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {pledges !== undefined && pledges.length > 0 ? (
        <p className="muted">
          {filtered.length} of {pledges.length} pledges · stages:{" "}
          {PLEDGE_STAGES.map((stage) => pledgeStageLabel(stage.slug)).join(" → ")}
        </p>
      ) : null}
    </Card>
  );
}
